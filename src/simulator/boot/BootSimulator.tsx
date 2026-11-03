import { Whiteboard } from '../whiteboard/Whiteboard';
import { BOOT_TIMELINE } from './bootTimeline';
import { BOOT_CAPTIONS_TA } from './bootCaptions.ta';
import { BootMachine, focusAnchorOf } from './BootMachine';

/**
 * Boot & OS — the pilot track on the lecturer's whiteboard: one viewport, one voice.
 * Title, controls and voice config stay on top; the machine fills the rest of the screen.
 * On phones the stage camera follows the focused part so the sketch stays readable.
 * Captions come in English and Tamil (jargons stay English); the toggle is in the top bar.
 */
export function BootSimulator() {
  return (
    <Whiteboard
      title="How a computer boots"
      steps={BOOT_TIMELINE.map((step) => ({ ...step, captionTa: BOOT_CAPTIONS_TA[step.id] }))}
      anchorFor={(sim) => focusAnchorOf(sim.current)}
      renderCanvas={(sim) => (
        <BootMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />
      )}
    />
  );
}
