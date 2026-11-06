import { AppTemplate, Button, ThemeToggle } from '@agiler/ui';
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import { LoginScreen, SessionPending, SignedInHeading } from './auth/SessionScreen';
import { Studio, StudioDenied } from './auth/Studio';
import { useSession } from './auth/useSession';
import styles from './auth/auth.module.css';

import { Brand, NAV_ITEMS, type TrackId } from './scaffold';
import { BootSimulatorScreen } from './screens/BootSimulatorScreen';
import { BytecodeStepperScreen } from './screens/BytecodeStepperScreen';
import { DsaScreen } from './screens/DsaScreen';
import { JvmRuntimeScreen } from './screens/JvmRuntimeScreen';
import { PublishedLessonsScreen } from './screens/PublishedLessonsScreen';

/**
 * The playground is lazy: Monaco's editor core is heavy and belongs only to the track that
 * needs it — the three snapshot tracks keep a light first paint.
 */
const LazyPlaygroundScreen = lazy(() =>
  import('./screens/JavaPlaygroundScreen').then((module) => ({ default: module.JavaPlaygroundScreen })),
);

/**
 * Track map — all three phases shipped. Routing is hash-based: no router dependency.
 * The shell itself is AGILER's base design (AppTemplate from @agiler/ui): persistent
 * sidebar + topbar on desktop, drawer navigation on mobile.
 */
const TRACKS: Record<TrackId, ReactNode> = {
  'boot-os': <BootSimulatorScreen />,
  'jvm-runtime': <JvmRuntimeScreen />,
  'bytecode-stepper': <BytecodeStepperScreen />,
  'write-your-own': (
    <Suspense fallback={<p>Loading the editor…</p>}>
      <LazyPlaygroundScreen />
    </Suspense>
  ),
  dsa: <DsaScreen />,
  lessons: <PublishedLessonsScreen />,
};

type Route = TrackId | 'studio';

function routeFromHash(): Route {
  const path = (window.location.hash.replace(/^#/, '') || '/boot-os').split('?')[0];
  if (path === '/studio' || path.startsWith('/studio/')) return 'studio';
  const id = path.replace(/^\//, '').replace(/[^a-z-]/g, '') as TrackId;
  return Object.hasOwn(TRACKS, id) ? id : 'boot-os';
}

/**
 * Router-agnostic link for the template: renders a plain anchor around `#<to>` so the browser's
 * history (and its back/forward gestures) work, without pulling in a router.
 */
function HashLink(props: {
  to: string;
  className?: string;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <a href={`#${props.to}`} className={props.className} title={props.title} onClick={props.onClick}>
      {props.children}
    </a>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const auth = useSession();

  // Back/forward gestures (hash change without a click) must switch tracks too.
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (auth.state.status === 'loading' || auth.state.status === 'error') {
    return <SessionPending error={auth.state.status === 'error'} message={auth.state.message} onRetry={auth.retry} />;
  }
  if (auth.state.status === 'anonymous') {
    return <LoginScreen onLogin={auth.login} message={auth.state.message} />;
  }

  const { user } = auth.state.session;
  const items = user.role === 'admin' ? [...NAV_ITEMS, { label: 'Studio', to: '/studio' }] : NAV_ITEMS;

  return (
    <>
      {auth.state.focusHeading && <SignedInHeading username={user.username} />}
      <Fragment key={route}>
        <AppTemplate
          brand={<Brand />}
          title="Learn with Saravana"
          items={items}
          activePath={`/${route}`}
          linkComponent={HashLink}
          actions={
            <div className={styles.actions}>
              <span className={styles.account}>{user.username} ({user.role})</span>
              <Button variant="outline" size="sm" isLoading={auth.loggingOut} onClick={() => void auth.logout()}>
                {auth.loggingOut ? 'Signing out…' : 'Sign out'}
              </Button>
              <div className={styles.themeControl}><ThemeToggle /></div>
            </div>
          }
          onNavigate={() => setRoute(routeFromHash())}
        >
          {auth.state.warning && <p role="status">{auth.state.warning}</p>}
          {auth.logoutError && <p className={styles.error} role="alert">{auth.logoutError}</p>}
          {auth.loggingOut && <p role="status">Signing out…</p>}
          {route === 'studio'
            ? user.role === 'admin' ? <Studio onSessionExpired={auth.expire} /> : <StudioDenied />
            : TRACKS[route]}
        </AppTemplate>
      </Fragment>
    </>
  );
}
