import Editor from '@monaco-editor/react';
import { Alert, Button, Card, Stack } from '@agiler/ui';
import { useState } from 'react';

/**
 * The Java playground (Phase 2b) — the learner edits Java in Monaco, presses Run, and the
 * pipeline parses → compiles → runs it, producing the same bytecode micro-steps the curated
 * stepper shows. Nothing is executed as JavaScript; the "VM" interprets our own instructions.
 * A program that would produce more than 500 micro-steps is stopped with a friendly warning.
 */

import '../monacoSetup';
import { BytecodeTrace } from './BytecodeStepper';
import { simulateJava, type SimulationOutput } from './java/simulate';
import styles from './JavaPlayground.module.css';

const DEFAULT_PROGRAM = `public class Main {

  public static void main(String[] args) {
    System.out.println("Counting:");
    int i = 1;
    while (i <= 3) {
      System.out.println("i = " + i);
      i++;
    }
    int result = add(2, 3);
    System.out.println("2 + 3 = " + result);
  }

  static int add(int a, int b) {
    int sum = a + b;
    return sum;
  }
}`;

function sourceLinesOf(source: string): Array<{ line: number; text: string }> {
  return source.split('\n').map((text, index) => ({ line: index + 1, text }));
}

export function JavaPlayground() {
  const [source, setSource] = useState(DEFAULT_PROGRAM);
  const [output, setOutput] = useState<SimulationOutput | null>(null);
  const [runId, setRunId] = useState(0);

  const compileAndRun = () => {
    setOutput(simulateJava(source));
    setRunId((current) => current + 1);
  };

  return (
    <div className={styles.playground}>
      <Card padding="lg">
        <div className={styles.editorCard}>
          <Stack gap={3}>
            <h3>Your Java</h3>
            <p className={styles.hint}>
              Supported subset: static methods, int/String/boolean locals, arithmetic, comparisons,
              if/else, while, method calls, System.out.println. Press Run to compile it into
              bytecode and step through every micro-step.
            </p>
          </Stack>
          <div className={styles.editorWrap}>
            <Editor
              height="260px"
              defaultLanguage="java"
              theme="vs"
              value={source}
              onChange={(value) => setSource(value ?? '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
          <div className={styles.runRow}>
            <Button variant="primary" size="sm" onClick={compileAndRun}>
              ▶ Run — compile to bytecode
            </Button>
            <span className={styles.hint}>
              The engine stops a program after 500 micro-steps with a friendly warning (PRD §2).
            </span>
          </div>
        </div>
      </Card>

      {output && !output.ok && (
        <Alert variant="danger" title="This program does not compile">
          {output.line ? `Line ${output.line}: ${output.error}` : output.error}
        </Alert>
      )}

      {output && output.ok && output.result.error && (
        <Alert variant="danger" title="The run stopped with an error">
          {output.result.error}
        </Alert>
      )}

      {output && output.ok && output.result.truncated && (
        <Alert variant="warning" title="Showing the first 500 micro-steps">
          This program produces more than 500 micro-steps — the engine stopped there so your
          browser stays smooth. Shorten the loop (or the recursion) to watch the whole run.
        </Alert>
      )}

      {output && output.ok && output.result.steps.length > 0 && (
        <BytecodeTrace
          key={runId}
          sourceLines={sourceLinesOf(source)}
          listings={output.result.listings}
          steps={output.result.steps}
        />
      )}

      {!output && (
        <Card padding="lg">
          <div className={styles.statusStack}>
            <h3>Press Run to see your program's micro-steps</h3>
            <p className={styles.hint}>
              The same engine that drives the curated tracks will parse your program, compile it
              to bytecode and emit one snapshot per instruction — operand stack, local slots,
              frames and console included.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
