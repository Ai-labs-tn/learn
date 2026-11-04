import { AppTemplate, ThemeToggle } from '@agiler/ui';
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import { Brand, NAV_ITEMS, type TrackId } from './scaffold';
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
};

function trackFromHash(): TrackId {
  const path = (window.location.hash.replace(/^#/, '') || '/boot-os').split('?')[0];
  const id = path.replace(/^\//, '').replace(/[^a-z-]/g, '') as TrackId;
  return id in TRACKS ? id : 'boot-os';
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
  const [track, setTrack] = useState<TrackId>(trackFromHash);

  // Back/forward gestures (hash change without a click) must switch tracks too.
  useEffect(() => {
    const onHashChange = () => setTrack(trackFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <Fragment key={track}>
      <AppTemplate
        brand={<Brand />}
        title="Learn with Saravana"
        items={NAV_ITEMS}
        activePath={`/${track}`}
        linkComponent={HashLink}
        actions={<ThemeToggle />}
        onNavigate={() => setTrack(trackFromHash())}
      >
        {TRACKS[track]}
      </AppTemplate>
    </Fragment>
  );
}
