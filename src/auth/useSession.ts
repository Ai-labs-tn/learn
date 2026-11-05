import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, readSession, request, type Session } from './api';

type SessionState =
  | { status: 'loading' }
  | { status: 'error'; message?: string }
  | { status: 'anonymous'; message?: string }
  | { status: 'authenticated'; session: Session; focusHeading?: boolean };

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
      const session = await readSession('/api/auth/me', { signal: controller.signal });
      if (mounted.current && generation.current === current) {
        setState({ status: 'authenticated', session, focusHeading: options.focusHeading });
      }
    } catch (error) {
      if (!mounted.current || generation.current !== current || controller.signal.aborted) return;
      setState(error instanceof ApiError && error.status === 401
        ? { status: 'anonymous', message: options.anonymousMessage }
        : { status: 'error', message: options.errorMessage });
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
    const onChange = () => { void check({ background: true }); };
    const onMessage = (event: MessageEvent) => { if (event.data === 'changed') onChange(); };
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onChange(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onChange(); };
    const onFocus = () => { if (document.visibilityState === 'visible') onChange(); };
    channel.current?.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onVisibility, 60_000);
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
