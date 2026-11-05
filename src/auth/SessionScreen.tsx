import { Button, Input, ThemeToggle } from '@agiler/ui';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { ApiError } from './api';
import styles from './auth.module.css';

function SessionFrame({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="session-title">
        <header className={styles.cardHeader}>
          <p className={styles.brand}>Learn with Saravana</p>
          <div className={styles.themeControl}><ThemeToggle /></div>
        </header>
        {children}
      </section>
    </main>
  );
}

export function SessionPending({ error, message, onRetry }: { error: boolean; message?: string; onRetry: () => void }) {
  return (
    <SessionFrame>
      <h1 id="session-title">{error ? 'Unable to check your session' : 'Checking your session'}</h1>
      {error ? <>
        <p role="alert">{message ?? 'We could not reach the sign-in service. Check your connection and try again.'}</p>
        <Button onClick={onRetry}>Try again</Button>
      </> : <p role="status">Loading your session…</p>}
    </SessionFrame>
  );
}

export function SignedInHeading({ username }: { username: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <h1 className={styles.srOnly} ref={heading} tabIndex={-1}>Signed in as {username}. Learning tracks are available.</h1>;
}

export function LoginScreen({ onLogin, message }: {
  onLogin: (username: string, password: string) => Promise<void>;
  message?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Replaces focus on a removed sign-out button, including expiry and cross-tab sign-out.
  useEffect(() => { heading.current?.focus(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 401
        ? 'Invalid username or password.'
        : failure instanceof ApiError && failure.status === 429
          ? 'Too many sign-in attempts. Please wait and try again.'
          : 'Sign-in is unavailable right now. Please try again.');
    } finally {
      setPassword('');
      setPending(false);
    }
  };

  return (
    <SessionFrame>
      <h1 id="session-title" ref={heading} tabIndex={-1}>Sign in</h1>
      <p id="login-help">Administrators and guests sign in here using their configured username and password.</p>
      {message && <p role="status">{message}</p>}
      <form className={styles.form} onSubmit={submit} aria-describedby="login-help" aria-busy={pending}>
        <Input id="username" label="Username" name="username" autoComplete="username"
          autoCapitalize="none" spellCheck={false} required isRequired disabled={pending}
          value={username} onChange={(event) => setUsername(event.target.value)} />
        <Input id="password" label="Password" name="password" type="password" autoComplete="current-password"
          required isRequired disabled={pending} value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p role="alert">{error}</p>}
        <Button type="submit" isLoading={pending} disabled={!username.trim() || !password}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        {pending && <p role="status">Signing in securely…</p>}
      </form>
    </SessionFrame>
  );
}
