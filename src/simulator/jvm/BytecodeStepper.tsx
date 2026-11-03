import { Badge, Button, Card, ProgressBar, Stack } from '@agiler/ui';

/**
 * The bytecode stepper (Phase 2b) — one source line decomposed into its micro-steps:
 * the operand stack pushes and pops, the local slots fill, `invokestatic` pushes a frame
 * and `ireturn` pops it. Pure snapshot rendering; the listing is exact `javap -c` output.
 */

import { cn } from '../../utils/cn';
import { useSimulator } from '../useSimulator';
import { ADDER_SOURCE, BYTECODE, BYTECODE_TIMELINE } from './bytecodeTimeline';
import type { BytecodeFrame } from './types';
import styles from './BytecodeStepper.module.css';

function SourceView({ activeLine }: { activeLine: number }) {
  return (
    <pre className={styles.source}>
      {ADDER_SOURCE.map((source) => (
        <span
          key={source.line}
          className={cn(styles.sourceLine, source.line === activeLine && styles.sourceLineActive)}
        >
          <span className={styles.lineNo}>{source.line}</span>
          <span>{source.text || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

function BytecodeView({ method, pc }: { method: string; pc: number }) {
  return (
    <pre className={styles.bytecode}>
      {BYTECODE.map((listing) => (
        <span key={listing.method}>
          <span className={styles.methodName}>{listing.method}</span>
          {listing.lines.map((line) => (
            <span
              key={line.pc}
              className={cn(
                styles.bcLine,
                listing.method === method && line.pc === pc && styles.bcLineActive,
              )}
            >
              <span className={styles.pc}>{line.pc}:</span>
              <span>{line.text}</span>
            </span>
          ))}
        </span>
      ))}
    </pre>
  );
}

function FrameView({ frame, top }: { frame: BytecodeFrame; top: boolean }) {
  return (
    <div className={cn(styles.frameCard, top && styles.frameTop)}>
      <span className={cn(styles.frameName, !top && styles.frameFrozen)}>
        {frame.method}
        {!top && ' (frozen — resumes when the callee returns)'}
      </span>
      <span className={styles.sectionLabel}>Operand stack</span>
      <div className={styles.stack}>
        {frame.stack.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className={cn(styles.stackCell, index === frame.stack.length - 1 && styles.stackTop)}
          >
            {value}
          </span>
        ))}
        {frame.stack.length === 0 && <span className={styles.stackCell}>(empty)</span>}
      </div>
      <span className={styles.sectionLabel}>Local variables</span>
      <div className={styles.locals}>
        {frame.locals.map((local) => (
          <span key={local.slot} className={styles.localRow}>
            <span className={styles.slotNo}>{local.slot}</span>
            <span className={styles.localName}>{local.label}</span>
            <span className={styles.localValue}>= {local.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BytecodeStepper() {
  const sim = useSimulator(BYTECODE_TIMELINE);
  const step = sim.current;
  const [current, ...frozen] = step.frames;

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card padding="lg">
          <Stack gap={3}>
            <h3>Source</h3>
            <SourceView activeLine={step.sourceLine} />
          </Stack>
        </Card>
        <Card padding="lg">
          <Stack gap={3}>
            <h3>Bytecode (javap -c)</h3>
            <BytecodeView method={current?.method ?? BYTECODE[0].method} pc={step.pc} />
          </Stack>
        </Card>
      </div>

      <div className={styles.column}>
        <Card padding="lg">
          <Stack gap={4}>
            <Badge variant="info" size="sm">
              {step.phase}
            </Badge>
            <h2>{step.title}</h2>
            <p>{step.narration}</p>
            <ProgressBar label="Program progress" value={sim.progress} size="md" />
            <div className={styles.controls}>
              <Button variant="outline" size="sm" onClick={sim.prev} disabled={sim.atStart}>
                ← Prev
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={sim.toggle}
                disabled={sim.atEnd && !sim.playing}
              >
                {sim.playing ? 'Pause' : 'Play'}
              </Button>
              <Button variant="outline" size="sm" onClick={sim.next} disabled={sim.atEnd}>
                Next →
              </Button>
              <span className={styles.spacer} />
              <Button variant="ghost" size="sm" onClick={sim.reset}>
                Restart
              </Button>
            </div>
            <span className={styles.stepChip}>
              Micro-step {sim.index + 1} of {sim.total}
            </span>
          </Stack>
        </Card>

        {current && <FrameView frame={current} top />}
        {frozen.map((frame) => (
          <FrameView key={frame.method} frame={frame} top={false} />
        ))}
        {step.frames.length === 0 && (
          <Card padding="lg">
            <Stack gap={2}>
              <h3>Frames</h3>
              <p>The stack is empty — main() has returned and the JVM is shutting down.</p>
            </Stack>
          </Card>
        )}

        <Card padding="lg">
          <Stack gap={3}>
            <h3>Console (stdout)</h3>
            <pre className={styles.console}>{step.console.length === 0 ? '—' : step.console.join('\n')}</pre>
          </Stack>
        </Card>
      </div>
    </div>
  );
}
