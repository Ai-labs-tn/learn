import { AppTemplate, Button, ThemeToggle } from '@agiler/ui';
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import { LoginScreen, SessionPending, SignedInHeading } from './auth/SessionScreen';
import { Studio, StudioDenied } from './auth/Studio';
import { useSession } from './auth/useSession';
import styles from './auth/auth.module.css';

import { Portfolio } from './portfolio/Portfolio';
import { DEFAULT_LEARNING_PATH, resolveLearningRoute } from './learning/catalog';
import { SkillTrack } from './learning/SkillTrack';
import { CaptionAccessProvider } from './captions/CaptionAccess';
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

const routeFromHash = () => resolveLearningRoute(window.location.hash);

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
    <a href={`#${props.to}`} className={props.className} title={props.title} onClick={props.onClick}
      aria-current={routeFromHash().path === props.to || routeFromHash().path.startsWith(`${props.to}/`) ? 'page' : undefined}>
      {props.children}
    </a>
  );
}

const wantsLogin = () => window.location.hash.split('?')[0] === '#/login';

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [loginPage, setLoginPage] = useState(wantsLogin);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const auth = useSession();
  const { hadSession } = auth;
  const status = auth.state.status;

  // Back/forward gestures (hash change without a click) must switch tracks too.
  useEffect(() => {
    const onHashChange = () => { setRoute(routeFromHash()); setLoginPage(wantsLogin()); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // After signing in, leave the login URL for the learning tracks.
  useEffect(() => {
    if (status === 'authenticated' && wantsLogin()) window.location.replace(`#${DEFAULT_LEARNING_PATH}`);
  }, [status]);

  // After logout or expiry the portfolio is the landing page; do not leave a stale app URL behind.
  useEffect(() => {
    if (status === 'anonymous' && !wantsLogin() && window.location.hash !== '' && window.location.hash !== '#/') {
      window.history.replaceState(null, '', '#/');
      setRoute(routeFromHash());
    }
  }, [status]);

  if (status !== 'authenticated') {
    if (loginPage) {
      return auth.state.status === 'anonymous'
        ? <LoginScreen onLogin={auth.login} message={auth.state.message} />
        : <SessionPending error={auth.state.status === 'error'} message={auth.state.message} onRetry={auth.retry} />;
    }
    // The portfolio never waits for the (possibly sleeping) API: it renders from its bundled snapshot.
    // A session-expiry banner only matters if there was an actual session that ended.
    const message = (hadSession && auth.state.status === 'anonymous') ? auth.state.message : undefined;
    return (
      <Portfolio
        onLogin={() => { window.location.hash = '#/login'; }}
        notice={message && message !== dismissedNotice ? message : undefined}
        onDismissNotice={() => setDismissedNotice(message ?? null)}
      />
    );
  }

  const { user } = auth.state.session;
  const items = user.role === 'admin' ? [...NAV_ITEMS, { label: 'Studio', to: '/studio', group: 'Existing tools' }] : NAV_ITEMS;

  return (
    <>
      {auth.state.focusHeading && <SignedInHeading username={user.username} />}
      <Fragment key={route.path}>
        <AppTemplate
          brand={<Brand />}
          title="Learn with Saravana"
          items={items}
          activePath={route.path}
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
          {route.kind === 'studio'
            ? user.role === 'admin' ? <Studio onSessionExpired={auth.expire} /> : <StudioDenied />
            : route.kind === 'lessons' ? TRACKS.lessons
              : <CaptionAccessProvider access={user.role === 'admin' ? { csrfToken: auth.state.session.csrfToken, onSessionExpired: auth.expire } : null}>
                  <SkillTrack skill={route.skill} chapter={route.chapter}>
                    {route.chapter && TRACKS[route.chapter.id]}
                  </SkillTrack>
                </CaptionAccessProvider>}
        </AppTemplate>
      </Fragment>
    </>
  );
}
