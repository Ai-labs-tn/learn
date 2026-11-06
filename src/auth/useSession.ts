import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, readSession, request, RequestTimeoutError, type Session } from './api';

const WAKING_MESSAGE = 'The server is waking up after being idle (free hosting sleeps when unused). This can take up to a minute — retrying automatically…';
const NOT_RESPONDING = 'The server is not responding. It may still be starting up — please try again in a moment.';
const WAKE_RETRIES = 3;

/** Timeouts, dropped connections and gateway errors are what a sleeping instance looks like. */
function transient(error: unknown) {
  return error instanceof RequestTimeoutError || error instanceof TypeError
    || (error instanceof ApiError && [502, 503, 504].includes(error.status));
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Initial session load: never hang silently — retry transient failures and say why. */
async function readSessionResilient(signal: AbortSignal, onWaiting: (message: string) => void): Promise<Session> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readSession('/api/auth/me', { signal });
    } catch (error) {
      if (signal.aborted || !transient(error) || attempt >= WAKE_RETRIES) throw error;
      onWaiting(WAKING_MESSAGE);
      await pause(3000 * (attempt + 1), signal);
      if (signal.aborted) throw error;
    }
  }
}

type SessionState =
  | { status: 'loading'; message?: string }
  | { status: 'error'; message?: string }
  | { status: 'anonymous'; message?: string }
  | { status: 'authenticated'; session: Session; focusHeading?: boolean; warning?: string };

type CheckOptions = {
  anonymousMessage?: string;
  errorMessage?: string;
  focusHeading?: boolean;
  background?: boolean;
};

const CHANNEL_NAME = 'learn-session-changed';
const STORAGE_KEY = 'learn-session-change-event';

export function useSession() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const checkController = useRef<AbortController | null>(null);
  const mutationInFlight = useRef(false);
  const checkQueued = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const statusRef = useRef<SessionState['status']>('loading');
  statusRef.current = state.status;

  // Invalidate older responses, including requests whose abort arrived after their response.
  const invalidate = useCallback(() => {
    generation.current += 1;
    checkController.current?.abort();
    checkController.current = null;
    return generation.current;
  }, []);

  const check = useCallback(async (options: CheckOptions = {}) => {
    if (mutationInFlight.current) {
      checkQueued.current = true;
      return;
    }
    const current = invalidate();
    const controller = new AbortController();
    checkController.current = controller;
    // Focus checks must not unmount the lesson/editor or interrupt active narration.
    if (!options.background) setState({ status: 'loading' });
    try {
      const session = options.background
        ? await readSession('/api/auth/me', { signal: controller.signal })
        : await readSessionResilient(controller.signal, (message) => {
          if (mounted.current && generation.current === current) setState({ status: 'loading', message });
        });
      if (mounted.current && generation.current === current) {
        setState({ status: 'authenticated', session, focusHeading: options.focusHeading });
      }
    } catch (error) {
      if (!mounted.current || generation.current !== current || controller.signal.aborted) return;
      if (options.background && !(error instanceof ApiError && error.status === 401)) {
        // A temporary network failure must not unmount a dirty editor. Every write
        // remains server-authorized; known revoked sessions still return to login.
        setState((previous) => previous.status === 'authenticated'
          ? { ...previous, warning: 'Connection interrupted. Your local work is retained; server access will be checked again.' }
          : { status: 'error', message: options.errorMessage ?? NOT_RESPONDING });
      } else if (options.background && error instanceof ApiError && error.status === 401) {
        // An active user must learn why they were returned to sign-in, not just see a form.
        setState({ status: 'anonymous', message: options.anonymousMessage ?? 'Your session expired. Please sign in again.' });
      } else {
        setState(error instanceof ApiError && error.status === 401
          ? { status: 'anonymous', message: options.anonymousMessage }
          : { status: 'error', message: options.errorMessage ?? (transient(error) ? NOT_RESPONDING : undefined) });
      }
    } finally {
      if (checkController.current === controller) checkController.current = null;
    }
  }, [invalidate]);

  const notifyOtherTabs = useCallback(() => {
    try {
      if (channel.current) {
        channel.current.postMessage('changed');
        return;
      }
    } catch { /* Use the non-secret storage event fallback below. */ }
    // Fallback is an event marker only: never store a username, cookie, CSRF token or session.
    try { localStorage.setItem(STORAGE_KEY, `${Date.now()}-${Math.random()}`); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    mounted.current = true;
    try {
      if (typeof BroadcastChannel !== 'undefined') channel.current = new BroadcastChannel(CHANNEL_NAME);
    } catch { channel.current = null; }
    // A background check supersedes the one in flight, so never start one while the initial
    // load (with its wake-up retries) is still running, or a slow cold start would be aborted.
    const onChange = () => { if (statusRef.current !== 'loading') void check({ background: true }); };
    const onMessage = (event: MessageEvent) => { if (event.data === 'changed') onChange(); };
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onChange(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onChange(); };
    const onFocus = () => { if (document.visibilityState === 'visible') onChange(); };
    // The periodic keep-alive only matters for a signed-in session: it renews it server-side.
    const onTick = () => { if (statusRef.current === 'authenticated') onVisibility(); };
    channel.current?.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onTick, 60_000);
    void check();
    return () => {
      mounted.current = false;
      invalidate();
      channel.current?.removeEventListener('message', onMessage);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [check, invalidate]);

  const login = async (username: string, password: string) => {
    if (mutationInFlight.current) throw new Error('A session change is already in progress.');
    mutationInFlight.current = true;
    const current = invalidate();
    let succeeded = false;
    try {
      const session = await readSession('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      succeeded = true;
      notifyOtherTabs();
      if (mounted.current && generation.current === current && !checkQueued.current) {
        setLogoutError(null);
        setState({ status: 'authenticated', session, focusHeading: true });
      }
    } finally {
      mutationInFlight.current = false;
      if (mounted.current && generation.current === current && checkQueued.current) {
        checkQueued.current = false;
        if (succeeded) setLogoutError(null);
        void check({ focusHeading: succeeded });
      }
    }
  };

  const logout = async () => {
    if (state.status !== 'authenticated' || mutationInFlight.current) return;
    mutationInFlight.current = true;
    const current = invalidate();
    setLoggingOut(true);
    setLogoutError(null);
    let recovery = false;
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': state.session.csrfToken },
      });
      notifyOtherTabs();
      if (mounted.current && generation.current === current && !checkQueued.current) {
        setState({ status: 'anonymous', message: 'You have signed out.' });
      }
    } catch (error) {
      if (mounted.current && generation.current === current) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
          recovery = true;
          setLogoutError('Sign-out was not confirmed. Your session was refreshed; please try signing out again.');
        } else {
          setLogoutError('Could not sign out. Your session may still be active. Please try again.');
        }
      }
    } finally {
      mutationInFlight.current = false;
      if (mounted.current && generation.current === current) {
        setLoggingOut(false);
        if (recovery || checkQueued.current) {
          checkQueued.current = false;
          void check(recovery ? {
            anonymousMessage: 'Sign-out was not confirmed, but no active session was found.',
            errorMessage: 'Sign-out was not confirmed, and your session could not be checked. Please try again.',
          } : {});
        }
      }
    }
  };

  const expire = useCallback(() => {
    void check({ anonymousMessage: 'Your session has expired. Please sign in again.' });
  }, [check]);

  return { state, login, logout, expire, loggingOut, logoutError, retry: () => void check() };
}
