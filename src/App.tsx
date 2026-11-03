import { BootSimulatorScreen } from './screens/BootSimulatorScreen';

/**
 * Phase 1 ships the Boot & OS simulator as the app's home screen. As later phases land
 * (JVM runtime, DSA) this becomes a routed shell with the lesson tracks around it.
 */
export function App() {
  return <BootSimulatorScreen />;
}
