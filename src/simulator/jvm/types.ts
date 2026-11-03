/**
 * JVM simulation types (Phase 2) — same engine contract as the boot track:
 * immutable snapshots + a step pointer (PRD §2). Nothing is executed.
 */

/** The class-loader delegation chain. */
export type LoaderId = 'bootstrap' | 'platform' | 'application';

export type LoaderState = 'idle' | 'active' | 'done';

export interface LoaderPart {
  id: LoaderId;
  label: string;
  state: LoaderState;
  note?: string;
}

/** Stages of linking, in order: load → verify → prepare → resolve → initialise. */
export type ClassLoadStage = 'loading' | 'verify' | 'prepare' | 'resolve' | 'initialise' | 'ready';

export interface LoadedClass {
  name: string;
  loader: LoaderId;
  stage: ClassLoadStage;
  note?: string;
}

/** Where an object lives in the generational heap. */
export type HeapGeneration = 'eden' | 'survivor' | 'old';

export interface HeapObject {
  id: string;
  label: string;
  generation: HeapGeneration;
}

export interface StackFrameView {
  method: string;
  note?: string;
}

export interface ThreadView {
  name: string;
  state: 'idle' | 'running' | 'done';
  /** Frames, outermost first. */
  frames: StackFrameView[];
}

import { FocusSpec } from '../types';

/** One immutable snapshot of the whole JVM. */
export interface JvmStep {
  id: string;
  phase: string;
  title: string;
  /** The line the presenter "says" for this step. */
  caption: string;
  /** The presenter's focus choreography for this step. */
  focus: FocusSpec;
  loaders: LoaderPart[];
  /** Classes resident in Metaspace, with their load stage. */
  classes: LoadedClass[];
  heap: HeapObject[];
  threads: ThreadView[];
  console: string[];
}

/* --- Bytecode stepper ----------------------------------------------------- */

export interface LocalSlot {
  slot: number;
  label: string;
  value: string;
}

export interface BytecodeFrame {
  method: string;
  pc: number;
  /** Operand stack, bottom → top. */
  stack: string[];
  locals: LocalSlot[];
}

/** One micro-step: the machine state while one bytecode instruction is in flight. */
export interface BytecodeStep {
  id: string;
  /** The source line this micro-step belongs to. */
  phase: string;
  title: string;
  narration: string;
  sourceLine: number;
  pc: number;
  /** Top of the frame stack first (the running frame). */
  frames: BytecodeFrame[];
  console: string[];
}
