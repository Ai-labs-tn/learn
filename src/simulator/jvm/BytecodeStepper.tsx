import { Badge, Button, Card, ProgressBar, Stack } from '@agiler/ui';

/**
 * The bytecode stepper — now a whiteboard lecture: source, bytecode, frame inspector and console
 * live as cards on the board; each micro-step is a spoken beat (the operand stack pushes and
 * pops, `invokestatic` pushes a real frame). The curated Adder program and the learner's own
 * playground share this trace.
 */

import { cn } from '../../utils/cn';
import { useSimulator } from '../useSimulator';
import { Whiteboard } from '../whiteboard/Whiteboard';
import { ADDER_SOURCE, BYTECODE, BYTECODE_TIMELINE } from './bytecodeTimeline';
import { BYTECODE_CAPTIONS_TA } from './bytecodeCaptions.ta';
import type { BytecodeFrame, BytecodeStep } from './types';
import styles from './BytecodeStepper.module.css';

export interface TraceListing {
  method: string;
  lines: Array<{ pc: number; text: string }>;
}

function SourceView({ lines, activeLine }: { lines: Array<{ line: number; text: string }>; activeLine: number }) {
  return (
    <pre className={styles.source}>
      {lines.map((source) => (
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

function BytecodeView({ listings, method, pc }: { listings: TraceListing[]; method: string; pc: number }) {
  return (
    <pre className={styles.bytecode}>
      {listings.map((listing) => (
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
        {!top && ' (frozen)'}
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

/* --- The board (viewBox 1040 × 620): four cards + the running frame ------------------------- */

const BOARD = {
  source: { x: 50, y: 70, w: 340, h: 480 },
  bytecode: { x: 420, y: 70, w: 290, h: 480 },
  frame: { x: 740, y: 70, w: 250, h: 330 },
  console: { x: 740, y: 425, w: 250, h: 125 },
} as const;

const ANCHORS: Record<string, { x: number; y: number }> = {
  source: { x: 220, y: 310 },
  bytecode: { x: 565, y: 310 },
  frame: { x: 865, y: 235 },
  console: { x: 865, y: 487 },
};

const FRAME_STEPS = new Set(['invoke', 'ireturn', 'istore-result', 'istore-sum']);
const ADD_METHOD_STEPS = new Set(['load-a', 'load-b', 'iadd', 'istore-sum', 'load-sum', 'ireturn']);

function focusPartOf(step: BytecodeStep): string {
  if (FRAME_STEPS.has(step.id)) return 'frame';
  if (step.id === 'println' || step.id === 'getstatic') return 'console';
  return 'bytecode';
}

const pctX = (x: number): string => `${(x / 1040) * 100}%`;
const pctY = (y: number): string => `${(y / 620) * 100}%`;
const pctW = (w: number): string => `${(w / 1040) * 100}%`;
const pctH = (h: number): string => `${(h / 620) * 100}%`;

export function BytecodeBoard({
  step,
  sourceLines,
  listings,
}: {
  step: BytecodeStep;
  sourceLines: Array<{ line: number; text: string }>;
  listings: TraceListing[];
}) {
  const part = focusPartOf(step);
  const anchor = ANCHORS[part];
  const [current, ...frozen] = step.frames;
  const lastLine = step.console[step.console.length - 1] ?? '';

  return (
    <>
      <svg className={styles.ink} viewBox="0 0 1040 620" role="img" aria-label="The bytecode lecture board">
        <defs>
          <filter id="ink-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
          </filter>
        </defs>
        <g filter="url(#ink-rough)">
          {(
            [
              ['source', BOARD.source, 'Source', 'var(--color-info)'],
              ['bytecode', BOARD.bytecode, 'Bytecode', 'var(--color-primary)'],
              ['frame', BOARD.frame, 'Frames', 'var(--color-success)'],
              ['console', BOARD.console, 'Console (stdout)', 'var(--color-warning)'],
            ] as const
          ).map(([id, rect, label, color]) => (
            <g key={id} className={cn(styles.layer, part === id ? styles.focus : styles.shown)}>
              <rect
                x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={12}
                fill="var(--color-surface)" stroke={part === id ? color : 'var(--color-border)'}
                strokeWidth={part === id ? 2.6 : 2} pathLength={1}
              />
              <text x={rect.x + 16} y={rect.y + 26} fontSize={11} fill={color} className={styles.inkTextStrong}>
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Card contents (HTML over the ink) */}
      <div
        className={styles.cardContent}
        style={{
          left: pctX(BOARD.source.x + 10),
          top: pctY(BOARD.source.y + 38),
          width: pctW(BOARD.source.w - 20),
          height: pctH(BOARD.source.h - 52),
        }}
      >
        <SourceView lines={sourceLines} activeLine={step.sourceLine} />
      </div>
      <div
        className={styles.cardContent}
        style={{
          left: pctX(BOARD.bytecode.x + 10),
          top: pctY(BOARD.bytecode.y + 38),
          width: pctW(BOARD.bytecode.w - 20),
          height: pctH(BOARD.bytecode.h - 52),
        }}
      >
        <BytecodeView listings={listings} method={current?.method ?? ''} pc={step.pc} />
      </div>
      <div
        className={cn(styles.cardContent, styles.frameStack)}
        style={{
          left: pctX(BOARD.frame.x + 10),
          top: pctY(BOARD.frame.y + 38),
          width: pctW(BOARD.frame.w - 20),
          height: pctH(BOARD.frame.h - 52),
        }}
      >
        {current && <FrameView frame={current} top />}
        {frozen.map((frame) => (
          <FrameView key={frame.method} frame={frame} top={false} />
        ))}
        {step.frames.length === 0 && <p className={styles.emptyFrames}>The stack is empty — main() has returned.</p>}
      </div>
      <div
        className={cn(styles.cardContent, styles.consoleContent)}
        style={{
          left: pctX(BOARD.console.x + 10),
          top: pctY(BOARD.console.y + 38),
          width: pctW(BOARD.console.w - 20),
          height: pctH(BOARD.console.h - 52),
        }}
      >
        {step.console.length === 0 ? '—' : step.console.join('\n')}
      </div>
    </>
  );
}

/**
 * The generic trace — the playground's tool view for the learner's own programs (a dashboard
 * layout on purpose: it is a workbench, not a narrated lecture). The curated stepper above is
 * the whiteboard version of the same trace.
 */
export function BytecodeTrace(props: {
  sourceLines: Array<{ line: number; text: string }>;
  listings: TraceListing[];
  steps: BytecodeStep[];
}) {
  const sim = useSimulator(props.steps);
  const step = sim.current;
  const [current, ...frozen] = step.frames;

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card padding="lg">
          <Stack gap={3}>
            <h3>Source</h3>
            <SourceView lines={props.sourceLines} activeLine={step.sourceLine} />
          </Stack>
        </Card>
        <Card padding="lg">
          <Stack gap={3}>
            <h3>Bytecode</h3>
            <BytecodeView listings={props.listings} method={current?.method ?? ''} pc={step.pc} />
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

/** The curated Adder lecture — same trace, hand-authored exact javap listing. */
export function BytecodeStepper() {
  const sim = useSimulator(
    BYTECODE_TIMELINE.map((step) => ({
      ...step,
      caption: step.narration,
      captionTa: BYTECODE_CAPTIONS_TA[step.id],
      phase: ADD_METHOD_STEPS.has(step.id) ? 'add()' : 'main()',
    })),
  );
  const anchor = ANCHORS[focusPartOf(sim.current)];

  return (
    <Whiteboard
      title="Bytecode stepper"
      steps={sim.steps}
      anchorFor={() => anchor}
      renderCanvas={(boardSim) => (
        <BytecodeBoard
          step={boardSim.current}
          sourceLines={ADDER_SOURCE}
          listings={BYTECODE}
        />
      )}
    />
  );
}