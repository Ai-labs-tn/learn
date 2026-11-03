import { Whiteboard } from '../whiteboard/Whiteboard';
import { BOOT_TIMELINE } from './bootTimeline';
import { BootMachine } from './BootMachine';

/**
 * Boot & OS — the pilot track on the lecturer's whiteboard (one stage, one voice).
 * The old side-panel view is gone: the machine is the screen, the caption is the voice.
 */
export function BootSimulator() {
  return (
    <Whiteboard steps={BOOT_TIMELINE} renderCanvas={(sim) => (
      <BootMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />
    )} />
  );
}