import { SnapshotPlayer as Whiteboard } from '../../player/SnapshotPlayer';
import { JVM_TIMELINE } from './classLoadingTimeline';
import { JVM_CAPTIONS_TA } from './jvmCaptions.ta';
import { JvmMachine, focusAnchorOf } from './JvmMachine';

/**
 * JVM runtime — the whiteboard track: the process, its memory rooms, the loader chain and the
 * heap, sketched step by step with a spoken caption. On phones the camera follows the focus.
 * Captions come in English and Tamil (jargons stay English); the toggle is in the top bar.
 */
export function JvmRuntime() {
  return (
    <Whiteboard
      title="Inside the JVM"
      steps={JVM_TIMELINE.map((step) => ({ ...step, captionTa: JVM_CAPTIONS_TA[step.id] }))}
      anchorFor={(sim) => focusAnchorOf(sim.current)}
      renderCanvas={(sim) => (
        <JvmMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />
      )}
    />
  );
}
