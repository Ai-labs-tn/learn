/*
 * The learner-program pipeline (Phase 2b): source → parser → compiler → runner → snapshots.
 *
 * This is the seam where a full java-ast/ANTLR4 front-end can later replace the subset parser —
 * everything downstream (compiler, runner, UI) only sees this function.
 */

import { compileProgram } from './compiler';
import { runProgram, type EngineResult } from './engine';
import { JavaParseError, parseJava } from './parser';

export type SimulationOutput =
  | { ok: true; result: EngineResult }
  | { ok: false; error: string; line?: number };

export function simulateJava(source: string): SimulationOutput {
  try {
    const ast = parseJava(source);
    const methods = compileProgram(ast);
    return { ok: true, result: runProgram(methods, source) };
  } catch (caught) {
    if (caught instanceof JavaParseError) {
      return { ok: false, error: caught.message, line: caught.line };
    }
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : 'Unexpected simulation error',
    };
  }
}
