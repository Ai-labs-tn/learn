/*
 * The snapshot engine (Phase 2b) — runs compiled bytecode on a mini-JVM and emits one immutable
 * snapshot per instruction. This is the PRD's pipeline in miniature:
 *
 *   source → parser → compiler → [instruction stream] → runner → state snapshots[]
 *                                                            → UI = a step pointer
 *
 * Nothing here executes learner code as JavaScript — the "VM" interprets our own instruction
 * array. The 500-snapshot cap (PRD §2) keeps runaway loops and runaway recursion friendly.
 */

import type { BytecodeFrame, BytecodeStep } from '../types';
import type { CompiledMethod, Instruction } from './compiler';

export const MAX_MICRO_STEPS = 500;

export interface BytecodeListingGroup {
  method: string;
  lines: Array<{ pc: number; text: string }>;
}

export interface EngineResult {
  steps: BytecodeStep[];
  listings: BytecodeListingGroup[];
  /** True when the run hit the 500-snapshot cap. */
  truncated: boolean;
  /** A parse-free runtime error (e.g. division by zero), if one occurred. */
  error?: string;
}

type Value =
  | { kind: 'int'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'ref'; value: string };

function show(value: Value): string {
  if (value.kind === 'str') return `"${value.value}"`;
  if (value.kind === 'bool') return value.value ? 'true' : 'false';
  return String(value.value);
}

interface Frame {
  method: CompiledMethod;
  pc: number;
  stack: Value[];
  locals: Array<Value | undefined>;
}

const NARRATION: Record<string, string> = {
  iconst_m1: 'Pushes the int constant -1 onto the operand stack.',
  bipush: 'Pushes a small int constant as an immediate operand.',
  sipush: 'Pushes a larger int constant as an immediate operand.',
  ldc: 'Loads a constant from the constant pool.',
  iload: 'Copies a local variable onto the operand stack — loading never removes the local.',
  aload: 'Copies a reference-typed local onto the operand stack.',
  istore: 'Pops the top value into a local-variable slot.',
  astore: 'Pops the top reference into a local-variable slot.',
  iinc: 'Adds a constant to a local directly — no push, no pop. This is why loop counters compile to iinc.',
  iadd: 'Pops two ints and pushes their sum.',
  isub: 'Pops two ints and pushes their difference.',
  imul: 'Pops two ints and pushes their product.',
  idiv: 'Pops two ints and pushes their quotient.',
  irem: 'Pops two ints and pushes the remainder.',
  invokedynamic: 'Pops the operands and pushes their string concatenation (makeConcatWithConstants).',
  if_icmpeq: 'Pops two ints and jumps when they are equal.',
  if_icmpne: 'Pops two ints and jumps when they differ.',
  if_icmplt: 'Pops two ints and jumps when the first is less.',
  if_icmple: 'Pops two ints and jumps when the first is less or equal.',
  if_icmpgt: 'Pops two ints and jumps when the first is greater.',
  if_icmpge: 'Pops two ints and jumps when the first is greater or equal.',
  ifeq: 'Pops an int and jumps when it is zero (false).',
  goto: 'An unconditional jump — this is the loop back-edge.',
  getstatic: 'Fetches a static field — here, the PrintStream for stdout.',
  invokevirtual:
    'Pops the argument and the receiver, then calls the method chosen by the actual object type (virtual dispatch).',
  invokestatic: 'Pops the arguments and pushes a NEW frame for the callee; the caller freezes mid-instruction.',
  ireturn: 'Pops this frame and hands its top value to the caller.',
  areturn: 'Pops this frame and hands its reference to the caller.',
  return: 'Pops this frame — nothing is returned.',
};

function narrationFor(op: string): string {
  return NARRATION[op] ?? `Executes ${op}.`;
}

function instructionText(instr: Instruction): string {
  return instr.operand ? `${instr.op} ${instr.operand}` : instr.op;
}

export function runProgram(methods: CompiledMethod[], source: string): EngineResult {
  const main = methods.find((method) => method.name === 'main');
  if (!main) {
    return { steps: [], listings: [], truncated: false, error: 'No main method to run.' };
  }

  const sourceLines = new Map<number, string>();
  source.split('\n').forEach((text, index) => sourceLines.set(index + 1, text.trim()));

  const listings: BytecodeListingGroup[] = methods.map((method) => ({
    method: method.signature,
    lines: method.instructions.map((instr, pc) => ({ pc, text: instructionText(instr) })),
  }));

  const frames: Frame[] = [];
  const initialLocals: Array<Value | undefined> = main.slotTypes.map((type) =>
    type === 'String[]' ? { kind: 'ref', value: 'String[] @refs' } : undefined,
  );
  frames.push({ method: main, pc: 0, stack: [], locals: initialLocals });

  const steps: BytecodeStep[] = [];
  const consoleOut: string[] = [];
  let truncated = false;
  let error: string | undefined;

  const snapshotFrame = (frame: Frame): BytecodeFrame => ({
    method: frame.method.label,
    pc: frame.pc,
    stack: frame.stack.map(show),
    locals: frame.method.slotNames.map((name, slot) => ({
      slot,
      label: name,
      value: frame.locals[slot] ? show(frame.locals[slot] as Value) : '—',
    })),
  });

  const emit = (instr: Instruction, pc: number): void => {
    steps.push({
      id: `pc-${pc}-${steps.length}`,
      phase: instr.line > 0 ? `line ${instr.line} · ${sourceLines.get(instr.line) ?? ''}` : 'compiled',
      title: `${instr.op} — ${narrationFor(instr.op)}`,
      narration: narrationFor(instr.op),
      sourceLine: instr.line,
      pc,
      frames: [...frames].reverse().map(snapshotFrame),
      console: [...consoleOut],
    });
  };

  while (frames.length > 0) {
    if (steps.length >= MAX_MICRO_STEPS) {
      truncated = true;
      break;
    }
    const frame = frames[frames.length - 1];
    const instr = frame.method.instructions[frame.pc];
    if (!instr) {
      error = `Missing return statement in ${frame.method.name}()`;
      break;
    }

    let jumpTarget = instr.target;
    let advanced = false; // jumps and returns manage pc themselves

    const pop = (): Value => {
      const value = frame.stack.pop();
      if (!value) {
        throw new Error(`Operand stack underflow at ${frame.method.name} pc ${frame.pc}`);
      }
      return value;
    };
    const popInt = (): number => {
      const value = pop();
      if (value.kind === 'int') return value.value;
      if (value.kind === 'bool') return value.value ? 1 : 0;
      throw new Error(`Expected an int but found a ${value.kind}`);
    };

    switch (instr.op) {
      case 'iconst_0':
      case 'iconst_1':
      case 'iconst_2':
      case 'iconst_3':
      case 'iconst_4':
      case 'iconst_5':
        frame.stack.push({ kind: 'int', value: Number(instr.op.slice('iconst_'.length)) });
        break;
      case 'iconst_m1':
        frame.stack.push({ kind: 'int', value: -1 });
        break;
      case 'bipush':
      case 'sipush':
        frame.stack.push({ kind: 'int', value: Number(instr.operand) });
        break;
      case 'ldc': {
        const operand = instr.operand ?? '';
        if (operand.startsWith('// String')) {
          frame.stack.push({ kind: 'str', value: operand.slice('// String'.length).trim() });
        } else {
          frame.stack.push({ kind: 'int', value: Number(operand) });
        }
        break;
      }
      case 'iload':
      case 'aload': {
        const slot = Number(instr.operand);
        const value = frame.locals[slot];
        if (!value) {
          error = `Variable '${frame.method.slotNames[slot]}' is used before it is assigned`;
          break;
        }
        frame.stack.push(value);
        break;
      }
      case 'istore':
      case 'astore':
        frame.locals[Number(instr.operand)] = pop();
        break;
      case 'iinc': {
        const [slot, by] = (instr.operand ?? '0 0').split(' ');
        const current = frame.locals[Number(slot)];
        if (current?.kind !== 'int') {
          error = `iinc on a non-int local`;
          break;
        }
        frame.locals[Number(slot)] = { kind: 'int', value: current.value + Number(by) };
        break;
      }
      case 'iadd':
      case 'isub':
      case 'imul':
      case 'idiv':
      case 'irem': {
        const right = popInt();
        const left = popInt();
        if (instr.op === 'idiv' && right === 0) {
          error = 'Division by zero (java.lang.ArithmeticException in a real JVM)';
          break;
        }
        if (instr.op === 'irem' && right === 0) {
          error = 'Remainder by zero (java.lang.ArithmeticException in a real JVM)';
          break;
        }
        const result =
          instr.op === 'iadd'
            ? left + right
            : instr.op === 'isub'
              ? left - right
              : instr.op === 'imul'
                ? left * right
                : instr.op === 'idiv'
                  ? Math.trunc(left / right)
                  : left % right;
        frame.stack.push({ kind: 'int', value: result });
        break;
      }
      case 'invokedynamic': {
        const right = pop();
        const left = pop();
        const asText = (value: Value): string => (value.kind === 'str' ? value.value : show(value));
        frame.stack.push({ kind: 'str', value: `${asText(left)}${asText(right)}` });
        break;
      }
      case 'if_icmpeq':
      case 'if_icmpne':
      case 'if_icmplt':
      case 'if_icmple':
      case 'if_icmpgt':
      case 'if_icmpge': {
        const right = popInt();
        const left = popInt();
        const taken =
          instr.op === 'if_icmpeq'
            ? left === right
            : instr.op === 'if_icmpne'
              ? left !== right
              : instr.op === 'if_icmplt'
                ? left < right
                : instr.op === 'if_icmple'
                  ? left <= right
                  : instr.op === 'if_icmpgt'
                    ? left > right
                    : left >= right;
        if (taken && jumpTarget !== undefined) {
          frame.pc = jumpTarget;
          advanced = true;
        }
        break;
      }
      case 'ifeq': {
        const value = popInt();
        if (value === 0 && jumpTarget !== undefined) {
          frame.pc = jumpTarget;
          advanced = true;
        }
        break;
      }
      case 'goto':
        if (jumpTarget !== undefined) {
          frame.pc = jumpTarget;
          advanced = true;
        }
        break;
      case 'getstatic':
        frame.stack.push({ kind: 'ref', value: 'PrintStream(out)' });
        break;
      case 'invokevirtual': {
        const arg = pop(); // the argument
        pop(); // the receiver (PrintStream)
        consoleOut.push(arg.kind === 'str' ? arg.value : show(arg));
        break;
      }
      case 'invokestatic': {
        const calleeName = (instr.operand ?? '').match(/Method (\w+):/)?.[1] ?? '';
        const callee = methods.find((method) => method.name === calleeName);
        if (!callee) {
          error = `Unknown method '${calleeName}'`;
          break;
        }
        const argCount = callee.params.length;
        const args: Value[] = [];
        for (let i = 0; i < argCount; i++) {
          args.unshift(pop());
        }
        const locals: Array<Value | undefined> = new Array(callee.slotTypes.length).fill(undefined);
        args.forEach((value, index) => {
          locals[index] = value;
        });
        frames.push({ method: callee, pc: 0, stack: [], locals });
        // The caller's pc stays frozen at this invoke; `ireturn`/`return` advance it past the call.
        advanced = true;
        break;
      }
      case 'ireturn':
      case 'areturn':
      case 'return': {
        const returned = instr.op === 'return' ? undefined : pop();
        frames.pop();
        const caller = frames[frames.length - 1];
        if (caller) {
          if (returned) caller.stack.push(returned);
          caller.pc += 1;
        }
        advanced = true;
        break;
      }
      default:
        error = `Unsupported instruction '${instr.op}'`;
    }

    if (error) break;

    emit(instr, frame.pc);

    if (!advanced) {
      frame.pc += 1;
    }
  }

  return { steps, listings, truncated, error };
}
