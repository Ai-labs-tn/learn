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

/**
 * How the presenter treats this step on the whiteboard: one focal point per step, a pointer
 * gesture, and (optionally) a part being sketched onto the board for the first time.
 */
export interface FocusSpec {
  /** The part under the pointer. */
  part: string;
  /** draw = sketch it on; point = glide the pointer; circle = chalk-circle it; flow = animate a connector. */
  action: 'draw' | 'point' | 'circle' | 'flow';
  /** Parts that appear on the board with this step (drawn on with a stroke animation). */
  reveals?: string[];
  /** A connector to animate (power, data, program image…). */
  flow?: string;
  /** The chalk note written next to the focused part. */
  note?: string;
}

/** One immutable state snapshot of the whole machine. */
export interface BootStep {
  id: string;
  /** Phase grouping (Power, Firmware, POST, Bootloader, Kernel, User space, GUI, Process). */
  phase: string;
  title: string;
  /** The line the presenter "says" for this step — short, spoken, one focal point. */
  caption: string;
  /** The presenter's focus choreography for this step. */
  focus: FocusSpec;
  parts: MachinePart[];
  ram: RamRegion[];
  /** Boot log lines accumulated up to and including this step (typed into the machine's screen). */
  log: string[];
  /** OS processes visible in user space at this step. */
  processes: OsProcess[];
}
