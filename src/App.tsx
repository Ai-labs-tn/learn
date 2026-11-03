import { AppShell } from '@agiler/ui';
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import { AppSidebar, AppTopBar, NAV_ITEMS, type TrackId } from './scaffold';
import { BootSimulatorScreen } from './screens/BootSimulatorScreen';
import { BytecodeStepperScreen } from './screens/BytecodeStepperScreen';
import { DsaScreen } from './screens/DsaScreen';
import { JvmRuntimeScreen } from './screens/JvmRuntimeScreen';

/**
 * The playground is lazy: Monaco's editor core is heavy and belongs only to the track that
 * needs it — the three snapshot tracks keep a light first paint.
 */
const LazyPlaygroundScreen = lazy(() =>
  import('./screens/JavaPlaygroundScreen').then((module) => ({ default: module.JavaPlaygroundScreen })),
);

/**
 * Track map — all three phases shipped. Routing is hash-based: no router dependency.
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
};

function trackFromHash(): TrackId {
  const path = (window.location.hash.replace(/^#/, '') || '/boot-os').split('?')[0];
  const id = path.replace(/^\//, '').replace(/[^a-z-]/g, '') as TrackId;
  return id in TRACKS ? id : 'boot-os';
}

/**
 * Router-agnostic link for the sidebar: renders a plain anchor around `#<to>` so the browser's
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
  const [track, setTrack] = useState<TrackId>(trackFromHash);

  // Back/forward gestures (hash change without a click) must switch tracks too.
  useEffect(() => {
    const onHashChange = () => setTrack(trackFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <AppShell
      sidebar={
        <AppSidebar
          items={NAV_ITEMS}
          activePath={`/${track}`}
          linkComponent={HashLink}
          onNavigate={() => setTrack(trackFromHash())}
        />
      }
      topbar={<AppTopBar />}
    >
      <Fragment key={track}>{TRACKS[track]}</Fragment>
    </AppShell>
  );
}
