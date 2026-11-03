import { Whiteboard } from '../whiteboard/Whiteboard';
import { BOOT_TIMELINE } from './bootTimeline';
import { BootMachine, focusAnchorOf } from './BootMachine';

/**
 * Boot & OS — the pilot track on the lecturer's whiteboard: one viewport, one voice.
 * Title, controls and voice config stay on top; the machine fills the rest of the screen.
 * On phones the stage camera follows the focused part so the sketch stays readable.
 */
export function BootSimulator() {
  return (
    <Whiteboard
      title="How a computer boots"
      steps={BOOT_TIMELINE}
      anchorFor={(sim) => focusAnchorOf(sim.current)}
      renderCanvas={(sim) => (
        <BootMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />
      )}
    />
  );
}
