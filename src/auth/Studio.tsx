import { Button } from '@agiler/ui';
import { useEffect, useState } from 'react';

import { ApiError, request } from './api';
import styles from './auth.module.css';

export function Studio({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let controller: AbortController | null = null;
    let generation = 0;
    const verify = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const current = ++generation;
      setStatus('loading');
      try {
        const response = await request('/api/studio/status', { signal: requestController.signal });
        const body: unknown = await response.json();
        // The Phase 1 backend explicitly returns { status: 'placeholder' }.
        if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'placeholder') {
          throw new Error('Invalid Studio status response.');
        }
        if (!requestController.signal.aborted && current === generation) setStatus('ready');
      } catch (error) {
        if (requestController.signal.aborted || current !== generation) return;
        if (error instanceof ApiError && error.status === 401) onSessionExpired();
        else setStatus(error instanceof ApiError && error.status === 403 ? 'denied' : 'error');
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void verify(); };
    const onFocus = () => { if (document.visibilityState === 'visible') void verify(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    // A tab left in the foreground must not advertise verified access indefinitely either.
    const refreshTimer = window.setInterval(onVisibility, 60_000);
    void verify();
    return () => {
      window.clearInterval(refreshTimer);
      generation += 1;
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [attempt, onSessionExpired]);

  if (status === 'denied') return <StudioDenied />;
  return (
    <section className={styles.panel} aria-labelledby="studio-title">
      <h1 id="studio-title">Learning Studio</h1>
      {status === 'loading' && <p role="status">Checking Studio access…</p>}
      {status === 'error' && <>
        <p role="alert">Studio access could not be verified. Please try again.</p>
        <Button onClick={() => setAttempt((value) => value + 1)}>Retry Studio access</Button>
      </>}
      {status === 'ready' && <>
        <p role="status">Administrator access verified.</p>
        <h2>Phase 1 placeholder only</h2>
        <p>This phase provides secure administrator access. Lesson editing, drafts, AI assistance and publishing are not available yet.</p>
      </>}
      <a href="#/boot-os">Return to learning tracks</a>
    </section>
  );
}

export function StudioDenied() {
  return (
    <section className={styles.panel} aria-labelledby="studio-denied-title">
      <h1 id="studio-denied-title">Studio access denied</h1>
      <p role="alert">Studio is available only to administrators. Guests can continue using every learning track.</p>
      <a href="#/boot-os">Return to learning tracks</a>
    </section>
  );
}
