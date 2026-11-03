import { Whiteboard } from '../whiteboard/Whiteboard';
import { JVM_TIMELINE } from './classLoadingTimeline';
import { JvmMachine, focusAnchorOf } from './JvmMachine';

/**
 * JVM runtime — the whiteboard track: the process, its memory rooms, the loader chain and the
 * heap, sketched step by step with a spoken caption. On phones the camera follows the focus.
 */
export function JvmRuntime() {
  return (
    <Whiteboard
      title="Inside the JVM"
      steps={JVM_TIMELINE}
      anchorFor={(sim) => focusAnchorOf(sim.current)}
      renderCanvas={(sim) => (
        <JvmMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />
      )}
    />
  );
}
