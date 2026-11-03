/*
 * The bytecode stepper (Phase 2b) — one source line decomposed into its micro-steps.
 *
 * The program is curated and its 'javap -c' listing is exact. Each snapshot shows the operand
 * stack, the local-variable slots and the frame stack at the instant one instruction executes —
 * 'invokestatic' pushes a real frame, 'ireturn' pops it and hands the value back.
 */

import type { BytecodeFrame, BytecodeStep } from './types';

export interface SourceLine {
  line: number;
  text: string;
}

export const ADDER_SOURCE: SourceLine[] = [
  { line: 1, text: 'public class Main {' },
  { line: 2, text: '' },
  { line: 3, text: '  public static void main(String[] args) {' },
  { line: 4, text: '    int result = add(2, 3);' },
  { line: 5, text: '    System.out.println(result);' },
  { line: 6, text: '  }' },
  { line: 7, text: '' },
  { line: 8, text: '  static int add(int a, int b) {' },
  { line: 9, text: '    int sum = a + b;' },
  { line: 10, text: '    return sum;' },
  { line: 11, text: '  }' },
  { line: 12, text: '}' },
];

export interface BytecodeListing {
  method: string;
  lines: Array<{ pc: number; text: string }>;
}

export const BYTECODE: BytecodeListing[] = [
  {
    method: 'public static void main(java.lang.String[])',
    lines: [
      { pc: 0, text: 'iconst_2' },
      { pc: 1, text: 'iconst_3' },
      { pc: 2, text: 'invokestatic #7    // Method add:(II)I' },
      { pc: 5, text: 'istore_1' },
      { pc: 6, text: 'getstatic #13      // Field java/lang/System.out:Ljava/io/PrintStream;' },
      { pc: 9, text: 'iload_1' },
      { pc: 10, text: 'invokevirtual #19  // Method java/io/PrintStream.println:(I)V' },
      { pc: 13, text: 'return' },
    ],
  },
  {
    method: 'static int add(int, int);',
    lines: [
      { pc: 0, text: 'iload_0' },
      { pc: 1, text: 'iload_1' },
      { pc: 2, text: 'iadd' },
      { pc: 3, text: 'istore_2' },
      { pc: 4, text: 'iload_2' },
      { pc: 5, text: 'ireturn' },
    ],
  },
];

const MAIN_METHOD = 'Main.main(String[])';
const ADD_METHOD = 'Main.add(int,int)';

function mainFrame(stack: string[], result?: string): BytecodeFrame {
  return {
    method: MAIN_METHOD,
    pc: 0,
    stack: [...stack],
    locals: [
      { slot: 0, label: 'args', value: 'String[] @refs' },
      { slot: 1, label: 'result', value: result ?? '—' },
    ],
  };
}

function addFrame(stack: string[], a: string, b: string, sum?: string): BytecodeFrame {
  return {
    method: ADD_METHOD,
    pc: 0,
    stack: [...stack],
    locals: [
      { slot: 0, label: 'a', value: a },
      { slot: 1, label: 'b', value: b },
      { slot: 2, label: 'sum', value: sum ?? '—' },
    ],
  };
}

export const BYTECODE_TIMELINE: BytecodeStep[] = [
  {
    id: 'const-2',
    phase: 'line 4 · int result = add(2, 3)',
    title: 'iconst_2 — push the constant 2',
    narration:
      'main() has one frame: locals hold "args" (slot 0). The first instruction pushes the int constant 2 onto the operand stack — the scratch space every instruction computes on.',
    sourceLine: 4,
    pc: 0,
    frames: [mainFrame(['2'])],
    console: [],
  },
  {
    id: 'const-3',
    phase: 'line 4 · int result = add(2, 3)',
    title: 'iconst_3 — push the constant 3',
    narration:
      'The arguments are staged bottom-to-top: 2 first, then 3 — so the last argument sits on top, which is the order "invokestatic" expects.',
    sourceLine: 4,
    pc: 1,
    frames: [mainFrame(['2', '3'])],
    console: [],
  },
  {
    id: 'invoke',
    phase: 'line 4 · int result = add(2, 3)',
    title: 'invokestatic add — a new frame is born',
    narration:
      '"invokestatic" pops the two arguments, creates a new frame for add() with them in local slots 0 and 1, and pushes that frame on top. main() freezes mid-instruction at pc 2 — it will resume exactly there when add() returns.',
    sourceLine: 4,
    pc: 2,
    frames: [addFrame([], '2', '3'), mainFrame([])],
    console: [],
  },
  {
    id: 'load-a',
    phase: 'line 9 · int sum = a + b',
    title: "iload_0 — load 'a'",
    narration:
      'Inside add() now. "iload_0" copies local slot 0 onto the operand stack. Loading a local never removes it — the operand stack is a copy.',
    sourceLine: 9,
    pc: 0,
    frames: [addFrame(['2'], '2', '3'), mainFrame([])],
    console: [],
  },
  {
    id: 'load-b',
    phase: 'line 9 · int sum = a + b',
    title: "iload_1 — load 'b'",
    narration: 'Slot 1 joins the stack: now "2" sits under "3", ready to be combined.',
    sourceLine: 9,
    pc: 1,
    frames: [addFrame(['2', '3'], '2', '3'), mainFrame([])],
    console: [],
  },
  {
    id: 'iadd',
    phase: 'line 9 · int sum = a + b',
    title: 'iadd — the actual arithmetic',
    narration:
      '"iadd" pops two ints and pushes their sum. This is the whole computation of line 9 — one instruction, two pops, one push.',
    sourceLine: 9,
    pc: 2,
    frames: [addFrame(['5'], '2', '3'), mainFrame([])],
    console: [],
  },
  {
    id: 'istore-sum',
    phase: 'line 9 · int sum = a + b',
    title: "istore_2 — store into 'sum'",
    narration:
      '"istore_2" pops the 5 into local slot 2 — the variable the source called "sum". The operand stack is empty again.',
    sourceLine: 9,
    pc: 3,
    frames: [addFrame([], '2', '3', '5'), mainFrame([])],
    console: [],
  },
  {
    id: 'load-sum',
    phase: 'line 10 · return sum',
    title: "iload_2 — load 'sum' to return it",
    narration: '"return sum" compiles to two instructions: load the value, then return it. This is the load.',
    sourceLine: 10,
    pc: 4,
    frames: [addFrame(['5'], '2', '3', '5'), mainFrame([])],
    console: [],
  },
  {
    id: 'ireturn',
    phase: 'line 10 · return sum',
    title: 'ireturn — pop the frame, hand back 5',
    narration:
      "'ireturn' pops add()'s frame and delivers its top value onto main()'s operand stack. main() resumes at pc 2 — the instruction right after the call — as if nothing had happened.",
    sourceLine: 10,
    pc: 5,
    frames: [mainFrame(['5'])],
    console: [],
  },
  {
    id: 'istore-result',
    phase: 'line 4 · int result = add(2, 3)',
    title: "istore_1 — 'result = 5'",
    narration:
      'Back in main(), "istore_1" pops the returned 5 into local slot 1. Line 4 is complete — the assignment happened across two frames and an entire call cycle.',
    sourceLine: 4,
    pc: 5,
    frames: [mainFrame([], '5')],
    console: [],
  },
  {
    id: 'getstatic',
    phase: 'line 5 · System.out.println(result)',
    title: 'getstatic — fetch System.out',
    narration:
      'The field reference resolved during linking becomes a real object here: the PrintStream for stdout is pushed on the stack, ready to receive the call.',
    sourceLine: 5,
    pc: 6,
    frames: [mainFrame(['PrintStream(out)'], '5')],
    console: [],
  },
  {
    id: 'load-result',
    phase: 'line 5 · System.out.println(result)',
    title: "iload_1 — load 'result'",
    narration:
      'The argument for println() goes on top: receiver first, argument last — the order invokevirtual consumes them.',
    sourceLine: 5,
    pc: 9,
    frames: [mainFrame(['PrintStream(out)', '5'], '5')],
    console: [],
  },
  {
    id: 'println',
    phase: 'line 5 · System.out.println(result)',
    title: 'invokevirtual println — output!',
    narration:
      "'invokevirtual' pops the argument and the receiver and calls the method chosen by the object's actual type at runtime (virtual dispatch). The value crosses into the OS's stdout — the same console Phase 1 drew.",
    sourceLine: 5,
    pc: 10,
    frames: [mainFrame([], '5')],
    console: ['5'],
  },
  {
    id: 'return-void',
    phase: 'line 6 · }',
    title: 'return — main() is done',
    narration:
      'A void return pops the last frame. With no threads left, the JVM exits — back to the OS process lifecycle where this journey started.',
    sourceLine: 6,
    pc: 13,
    frames: [],
    console: ['5', 'Process exited (code 0)'],
  },
];
