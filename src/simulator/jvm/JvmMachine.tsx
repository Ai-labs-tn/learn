import { useEffect, useMemo, useState } from 'react';

/**
 * The JVM, sketched in colour on the lecturer's whiteboard: the process box, the loader
 * delegation chain, Metaspace, the generational heap, thread stacks and the process console.
 * Same contract as the boot machine: parts reveal when introduced, the pointer glides to the
 * focus, chalk notes annotate, and parts are clickable (chalk glossary).
 */

import { cn } from '../../utils/cn';
import { useTypewriter } from '../whiteboard/useTypewriter';
import { JVM_TIMELINE } from './classLoadingTimeline';
import type { JvmStep } from './types';
import styles from './JvmMachine.module.css';

/* --- Geometry (viewBox 1040 × 620) ----------------------------------------- */

const L = {
  process: { x: 56, y: 56, w: 928, h: 508 },
  loaderBootstrap: { x: 96, y: 110, w: 226, h: 54 },
  loaderPlatform: { x: 96, y: 178, w: 226, h: 54 },
  loaderApplication: { x: 96, y: 246, w: 226, h: 54 },
  metaspace: { x: 370, y: 96, w: 330, h: 140 },
  console: { x: 726, y: 96, w: 232, h: 140 },
  heapEden: { x: 96, y: 362, w: 152, h: 150 },
  heapSurvivor: { x: 256, y: 362, w: 152, h: 150 },
  heapOld: { x: 416, y: 362, w: 152, h: 150 },
  threads: { x: 620, y: 350, w: 338, h: 180 },
} as const;

const ANCHORS: Record<string, { x: number; y: number }> = {
  process: { x: 520, y: 310 },
  'loaders.bootstrap': { x: 209, y: 137 },
  'loaders.platform': { x: 209, y: 205 },
  'loaders.application': { x: 209, y: 273 },
  metaspace: { x: 535, y: 166 },
  console: { x: 842, y: 166 },
  'heap.eden': { x: 172, y: 437 },
  'heap.survivor': { x: 332, y: 437 },
  'heap.old': { x: 492, y: 437 },
  threads: { x: 789, y: 440 },
};

const CIRCLES: Record<string, { rx: number; ry: number }> = {
  process: { rx: 480, ry: 268 },
  metaspace: { rx: 180, ry: 88 },
};

const NOTE_OFFSET: Record<string, { x: number; y: number }> = {
  process: { x: 0, y: -250 },
  'loaders.bootstrap': { x: 150, y: 0 },
  'loaders.platform': { x: 150, y: 0 },
  'loaders.application': { x: 150, y: 8 },
  metaspace: { x: 0, y: 96 },
  console: { x: -130, y: 0 },
  'heap.eden': { x: 0, y: -140 },
  'heap.survivor': { x: 0, y: 96 },
  'heap.old': { x: 0, y: 96 },
  threads: { x: 0, y: 116 },
};

const FLOWS: Record<string, string> = {
  'gc-move': 'M240 380 C286 330 316 330 336 380',
};

const GLOSSARY: Record<string, string> = {
  process: 'The JVM process — created by the OS exactly like any other program (Phase 1).',
  'loaders.bootstrap': 'The bootstrap loader: native code that loads the core platform classes (java.lang.*).',
  'loaders.platform': 'The platform loader: loads platform modules — always asking the bootstrap first.',
  'loaders.application': 'The application loader: loads your classpath — delegating up before looking itself.',
  metaspace: 'Metaspace: class metadata in native memory (not the heap). A class lives here once loaded and linked.',
  'heap.eden': 'Eden: where every new object is born. Allocation is a pointer bump — that fast.',
  'heap.survivor': 'Survivor space: objects that survive a minor GC are copied here.',
  'heap.old': 'Old Gen: long-lived objects, tenured after surviving several collections.',
  threads: 'Thread stacks: one private stack per thread; every method call pushes a frame.',
  console: 'stdout — the process console the OS handed to this JVM.',
};

const PART_LABEL: Record<string, string> = {
  process: 'the JVM process',
  'loaders.bootstrap': 'bootstrap loader',
  'loaders.platform': 'platform loader',
  'loaders.application': 'application loader',
  metaspace: 'Metaspace',
  'heap.eden': 'Eden',
  'heap.survivor': 'Survivor',
  'heap.old': 'Old Gen',
  threads: 'thread stacks',
  console: 'console (stdout)',
};

function revealedAt(index: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= index; i++) {
    JVM_TIMELINE[i]?.focus.reveals?.forEach((part) => set.add(part));
  }
  return set;
}

function jumpIndexFor(part: string): number {
  const at = JVM_TIMELINE.findIndex(
    (candidate) => candidate.focus.part === part || candidate.focus.reveals?.includes(part),
  );
  return at < 0 ? 0 : at;
}

const pctX = (x: number): string => `${(x / 1040) * 100}%`;
const pctY = (y: number): string => `${(y / 620) * 100}%`;
const pctW = (w: number): string => `${(w / 1040) * 100}%`;
const pctH = (h: number): string => `${(h / 620) * 100}%`;

const INK = 'var(--color-text-primary)';

/** The board-space point the phone camera should centre on for this step. */
export function focusAnchorOf(step: JvmStep): { x: number; y: number } {
  return ANCHORS[step.focus.part] ?? ANCHORS.process;
}

const LOADER_COLOR: Record<string, string> = {
  bootstrap: 'var(--color-primary)',
  platform: 'var(--color-info)',
  application: 'var(--color-success)',
};

const LANE_COLOR: Record<string, string> = {
  eden: 'var(--color-info)',
  survivor: 'var(--color-warning)',
  old: 'var(--color-success)',
};

export function JvmMachine({
  step,
  index,
  onJump,
}: {
  step: JvmStep;
  index: number;
  onJump: (at: number) => void;
}) {
  const revealed = useMemo(() => revealedAt(index), [index]);
  const [inspect, setInspect] = useState<string | null>(null);
  const focus = step.focus;
  const fresh = (part: string): boolean => !!focus.reveals?.includes(part);
  const stateOf = (part: string): string =>
    !revealed.has(part) ? styles.hidden : focus.part === part ? styles.focus : styles.shown;

  useEffect(() => setInspect(null), [index]);

  const anchor = ANCHORS[focus.part] ?? ANCHORS.process;
  const noteAt = NOTE_OFFSET[focus.part] ?? { x: 0, y: 40 };
  const lastLog = step.console[step.console.length - 1] ?? '';
  const typedLog = useTypewriter(lastLog, 22);
  const flowPath = focus.flow ? FLOWS[focus.flow] : undefined;
  const inspectInfo = inspect
    ? { part: inspect, chapter: jumpIndexFor(inspect), anchor: ANCHORS[inspect] ?? ANCHORS.process }
    : null;
  const mainThread = step.threads[0];

  const g = (part: string): string => cn(styles.layer, stateOf(part), fresh(part) && styles.fresh);

  return (
    <>
      <svg className={styles.ink} viewBox="0 0 1040 620" role="img" aria-label="The JVM, drawn in colour">
        <defs>
          <filter id="ink-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
          </filter>
          <marker id="ink-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--color-primary)" />
          </marker>
        </defs>

        <g filter="url(#ink-rough)">
          {/* The JVM process box */}
          <g className={g('process')}>
            <rect
              x={L.process.x} y={L.process.y} width={L.process.w} height={L.process.h} rx={18}
              fill="var(--color-surface)" stroke={INK} strokeWidth={2.6} strokeOpacity={0.75} pathLength={1}
            />
            <text x={80} y={84} fontSize={12} className={styles.inkText}>
              the JVM — one process, many rooms
            </text>
          </g>

          {/* Loader delegation chain */}
          {(
            [
              ['loaders.bootstrap', L.loaderBootstrap, 'Bootstrap loader'],
              ['loaders.platform', L.loaderPlatform, 'Platform loader'],
              ['loaders.application', L.loaderApplication, 'Application loader'],
            ] as const
          ).map(([id, rect, label], position) => {
            const loaderState = step.loaders.find((candidate) => candidate.id === id.split('.')[1]);
            const color = LOADER_COLOR[id.split('.')[1]];
            return (
              <g key={id} className={g(id)}>
                <rect
                  x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={9}
                  fill="var(--color-surface)" stroke={color} strokeWidth={2.4} pathLength={1}
                />
                <text x={rect.x + 14} y={rect.y + 22} fontSize={11} fill={color} className={styles.inkTextStrong}>
                  {label}
                </text>
                <text x={rect.x + 14} y={rect.y + 40} fontSize={9} className={styles.inkText}>
                  {loaderState?.state === 'active' ? 'working…' : loaderState?.state === 'done' ? 'done' : 'idle'}
                </text>
                {position > 0 && (
                  <text x={rect.x + 14} y={rect.y - 8} fontSize={9} className={styles.inkText}>
                    ↑ delegates to
                  </text>
                )}
              </g>
            );
          })}

          {/* Metaspace shelf */}
          <g className={g('metaspace')}>
            <rect
              x={L.metaspace.x} y={L.metaspace.y} width={L.metaspace.w} height={L.metaspace.h} rx={10}
              fill="var(--color-surface)" stroke={INK} strokeWidth={2.4} pathLength={1}
            />
            <text x={L.metaspace.x + 12} y={L.metaspace.y + 20} fontSize={10.5} className={styles.inkTextStrong}>
              Metaspace
            </text>
            {step.classes.map((candidate, position) => (
              <g key={candidate.name} className={position === step.classes.length - 1 ? styles.freshFill : undefined}>
                <rect
                  x={L.metaspace.x + 12 + (position % 3) * 104}
                  y={L.metaspace.y + 30 + Math.floor(position / 3) * 44}
                  width={98} height={34} rx={6}
                  fill={candidate.stage === 'ready' ? 'var(--color-success-soft)' : 'var(--color-primary-soft)'}
                  stroke={candidate.stage === 'ready' ? 'var(--color-success)' : 'var(--color-primary)'}
                  strokeWidth={1.6}
                />
                <text
                  x={L.metaspace.x + 16 + (position % 3) * 104}
                  y={L.metaspace.y + 44 + Math.floor(position / 3) * 44}
                  fontSize={7.5}
                  className={styles.inkTextStrong}
                >
                  {candidate.name}
                </text>
                <text
                  x={L.metaspace.x + 16 + (position % 3) * 104}
                  y={L.metaspace.y + 56 + Math.floor(position / 3) * 44}
                  fontSize={7}
                  className={styles.inkText}
                >
                  {candidate.stage}
                </text>
              </g>
            ))}
            {step.classes.length === 0 && (
              <text x={L.metaspace.x + 14} y={L.metaspace.y + 60} fontSize={9.5} className={styles.inkText}>
                no classes yet
              </text>
            )}
          </g>

          {/* Console (dark CRT; content is HTML over the ink) */}
          <g className={g('console')}>
            <rect
              x={L.console.x} y={L.console.y} width={L.console.w} height={L.console.h} rx={10}
              fill="#0f172a" stroke={INK} strokeWidth={2.4} pathLength={1}
            />
            <text x={L.console.x + 12} y={L.console.y + 22} fontSize={10} fill="#4ade80" className={styles.inkTextStrong}>
              console — stdout
            </text>
          </g>

          {/* Heap lanes */}
          {(
            [
              ['heap.eden', L.heapEden, 'EDEN'],
              ['heap.survivor', L.heapSurvivor, 'SURVIVOR'],
              ['heap.old', L.heapOld, 'OLD GEN'],
            ] as const
          ).map(([id, rect, label]) => {
            const color = LANE_COLOR[id.split('.')[1]];
            const blobs = step.heap.filter((object) => object.generation === id.split('.')[1]);
            return (
              <g key={id} className={g(id)}>
                <rect
                  x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={10}
                  fill="var(--color-surface)" stroke={color} strokeWidth={2.4} strokeDasharray="6 4" pathLength={1}
                />
                <text x={rect.x + 12} y={rect.y + 22} fontSize={9.5} fill={color} className={styles.inkTextStrong}>
                  {label}
                </text>
                {blobs.map((object, blobIndex) => (
                  <g key={object.id} className={blobIndex === blobs.length - 1 ? styles.freshFill : undefined}>
                    <rect
                      x={rect.x + 14} y={rect.y + 34 + blobIndex * 32} width={rect.w - 28} height={26} rx={6}
                      fill={color === LANE_COLOR.survivor ? 'var(--color-warning-soft)' : color === LANE_COLOR.old ? 'var(--color-success-soft)' : 'var(--color-info-soft)'}
                      stroke={color} strokeWidth={1.5}
                    />
                    <text
                      x={rect.x + 22} y={rect.y + 51 + blobIndex * 32}
                      fontSize={8} className={styles.inkTextStrong}
                    >
                      {object.label}
                    </text>
                  </g>
                ))}
                {blobs.length === 0 && (
                  <text x={rect.x + 14} y={rect.y + 62} fontSize={9} className={styles.inkText}>
                    empty
                  </text>
                )}
              </g>
            );
          })}

          {/* Threads + frame stacks */}
          <g className={g('threads')}>
            <rect
              x={L.threads.x} y={L.threads.y} width={L.threads.w} height={L.threads.h} rx={10}
              fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth={2.4} pathLength={1}
            />
            <text x={L.threads.x + 14} y={L.threads.y + 24} fontSize={10.5} fill="var(--color-primary)" className={styles.inkTextStrong}>
              threads — one stack each
            </text>
            {mainThread ? (
              mainThread.frames.map((frame, frameIndex) => {
                const depth = mainThread.frames.length - 1 - frameIndex;
                return (
                  <g key={frame.method} className={frameIndex === mainThread.frames.length - 1 ? styles.freshFill : undefined}>
                    <rect
                      x={L.threads.x + 16} y={L.threads.y + L.threads.h - 52 - depth * 54}
                      width={L.threads.w - 32} height={44} rx={6}
                      fill={frameIndex === mainThread.frames.length - 1 ? 'var(--color-primary-soft)' : 'var(--color-surface-sunken)'}
                      stroke="var(--color-primary)" strokeWidth={1.6}
                    />
                    <text
                      x={L.threads.x + 28} y={L.threads.y + L.threads.h - 26 - depth * 54}
                      fontSize={9.5} className={styles.inkTextStrong}
                    >
                      {frame.method}
                    </text>
                  </g>
                );
              })
            ) : (
              <text x={L.threads.x + 16} y={L.threads.y + 60} fontSize={9.5} className={styles.inkText}>
                no threads yet
              </text>
            )}
          </g>
        </g>
      </svg>

      {/* The process console (HTML over the ink). */}
        {revealed.has('console') && (
          <div
            className={styles.consoleContent}
            style={{
              left: pctX(L.console.x + 10),
              top: pctY(L.console.y + 34),
              width: pctW(L.console.w - 20),
              height: pctH(L.console.h - 44),
            }}
          >
            {step.console.slice(0, -1).map((line, position) => (
              <div key={`${line}-${position}`} className={cn(styles.logLine, styles.logOld)}>
                {line}
              </div>
            ))}
            {lastLog && <div className={cn(styles.logLine, styles.logNew)}>{typedLog}</div>}
          </div>
        )}

      <svg className={styles.inkOverlay} viewBox="0 0 1040 620" aria-hidden="true">
        {flowPath && (
          <path
            d={flowPath}
            fill="none" stroke="var(--color-primary)" strokeWidth={2.2}
            markerEnd="url(#ink-arrow)" className={styles.freshFill}
          />
        )}
        {focus.action === 'circle' && CIRCLES[focus.part] && (
          <ellipse
            cx={anchor.x} cy={anchor.y}
            rx={CIRCLES[focus.part].rx} ry={CIRCLES[focus.part].ry}
            fill="none" stroke="var(--color-warning)" strokeWidth={2.8} pathLength={1}
            className={styles.fresh} strokeDasharray="1"
          />
        )}
        {focus.note && (
          <g className={styles.freshFill}>
            <rect
              x={anchor.x + noteAt.x - (focus.note.length * 3.3 + 10)}
              y={anchor.y + noteAt.y - 13}
              width={focus.note.length * 6.6 + 20}
              height={21} rx={5}
              fill="var(--color-warning)" opacity={0.18}
            />
            <text
              x={anchor.x + noteAt.x} y={anchor.y + noteAt.y + 2}
              textAnchor="middle" fontSize={11} className={styles.noteText}
            >
              {focus.note}
            </text>
          </g>
        )}
        <g className={styles.pointer} style={{ transform: `translate(${anchor.x}px, ${anchor.y}px)` }}>
          <line x1={0} y1={-66} x2={0} y2={-12} stroke="var(--color-primary)" strokeWidth={2.4} />
          <path d="M0 0 L-7 -15 L7 -15 Z" fill="var(--color-primary)" />
        </g>
      </svg>

      {/* Click-to-explore */}
      <svg className={styles.inkOverlay} viewBox="0 0 1040 620" aria-hidden="true">
        {(
          [
            ['loaders.bootstrap', L.loaderBootstrap],
            ['loaders.platform', L.loaderPlatform],
            ['loaders.application', L.loaderApplication],
            ['metaspace', L.metaspace],
            ['console', L.console],
            ['heap.eden', L.heapEden],
            ['heap.survivor', L.heapSurvivor],
            ['heap.old', L.heapOld],
            ['threads', L.threads],
            ['process', L.process],
          ] as const
        ).map(([part, rect]) => (
          <rect
            key={part}
            className={styles.hit}
            x={rect.x} y={rect.y} width={rect.w} height={rect.h}
            onClick={() => setInspect(part)}
          />
        ))}
      </svg>

      {inspectInfo && (
        <div
          className={styles.glossaryCard}
          style={{
            left: `min(${pctX(inspectInfo.anchor.x + 24)}, calc(100% - 250px))`,
            top: pctY(Math.min(inspectInfo.anchor.y + 26, 470)),
          }}
        >
          <div className={styles.glossaryHead}>
            <span className={styles.glossaryName}>{PART_LABEL[inspectInfo.part] ?? inspectInfo.part}</span>
            <button type="button" className={styles.glossaryClose} onClick={() => setInspect(null)} aria-label="Close">
              ×
            </button>
          </div>
          <p className={styles.glossaryBody}>{GLOSSARY[inspectInfo.part]}</p>
          <button
            type="button"
            className={styles.glossaryAction}
            onClick={() => {
              setInspect(null);
              onJump(inspectInfo.chapter);
            }}
          >
            ↺ Replay its chapter
          </button>
        </div>
      )}
    </>
  );
}