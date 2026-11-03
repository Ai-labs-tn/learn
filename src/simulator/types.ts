/**
 * Simulation core types (JVM-Lens PRD §2).
 *
 * The engine is *deterministic*: it pre-computes an array of **state snapshots** and the UI is a
 * single `currentStepIndex` pointer that animates to whichever snapshot is current. Nothing is
 * executed — the snapshots are data.
 */

/** One simulated hardware component of the machine. */
export type PartId = 'cpu' | 'ram' | 'hdd' | 'ssd' | 'firmware';

/** Lifecycle of a part at a given step. */
export type PartState = 'off' | 'idle' | 'active' | 'done';

export interface MachinePart {
  id: PartId;
  label: string;
  state: PartState;
  /** One-line teaching note shown under the part (optional). */
  note?: string;
}

/** A region of RAM, filled as the boot / run progresses. */
export interface RamRegion {
  id: 'kernel' | 'user';
  label: string;
  /** 0–100 — how full this region is at this step. */
  fill: number;
  note?: string;
}

/** A process the OS has created in user space (appears from "launch an app" onwards). */
export interface OsProcess {
  name: string;
  note: string;
}

/** One immutable state snapshot of the whole machine. */
export interface BootStep {
  id: string;
  /** Phase grouping (Power, Firmware, POST, Bootloader, Kernel, User space, GUI, Process). */
  phase: string;
  title: string;
  /** What is happening, and why the learner should care. */
  narration: string;
  parts: MachinePart[];
  ram: RamRegion[];
  /** Boot log lines accumulated up to and including this step. */
  log: string[];
  /** OS processes visible in user space at this step. */
  processes: OsProcess[];
}
