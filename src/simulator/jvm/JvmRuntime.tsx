import { Badge, Button, Card, ProgressBar, Stack } from '@agiler/ui';

/**
 * JVM runtime simulator (Phase 2a) — what happens between `java Main` and `main()`:
 * the JVM as an OS process, the runtime data areas, loader delegation, linking
 * (verify → prepare → resolve), <clinit>, the heap generations and a minor GC.
 *
 * Pure snapshot rendering: `JVM_TIMELINE` is data; `useSimulator` moves the pointer.
 */

import { cn } from '../../utils/cn';
import { useSimulator } from '../useSimulator';
import { JVM_TIMELINE } from './classLoadingTimeline';
import type { ClassLoadStage, HeapGeneration, LoaderState } from './types';
import styles from './JvmRuntime.module.css';

function cardState(state: LoaderState): string {
  if (state === 'active') return styles.stateActive;
  if (state === 'done') return styles.stateDone;
  return styles.stateIdle;
}

function stageChip(stage: ClassLoadStage): string {
  return stage === 'ready' ? styles.chipReady : styles.chipLoading;
}

function laneObjectClass(generation: HeapGeneration): string {
  if (generation === 'old') return styles.heapObjectOld;
  if (generation === 'survivor') return styles.heapObjectSurvivor;
  return styles.heapObject;
}

export function JvmRuntime() {
  const sim = useSimulator(JVM_TIMELINE);
  const step = sim.current;

  return (
    <div className={styles.grid}>
      <Card padding="lg">
        <div className={styles.machine}>
          <div className={styles.card}>
            <span className={styles.title}>
              Class loaders
              <span className={styles.tag}>delegation: child asks, parent answers first</span>
            </span>
            <div className={styles.chain}>
              {step.loaders.map((candidate, index) => (
                <div key={candidate.id}>
                  {index > 0 && <div className={styles.delegation}>↑ delegates to</div>}
                  <div className={cn(styles.loader, cardState(candidate.state))}>
                    <span className={styles.loaderLabel}>{candidate.label}</span>
                    <span className={styles.loaderNote}>{candidate.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <span className={styles.title}>
              Metaspace
              <span className={styles.tag}>class metadata — native memory, not the heap</span>
            </span>
            <div className={styles.chips}>
              {step.classes.length === 0 && <span className={styles.empty}>No classes loaded yet.</span>}
              {step.classes.map((candidate) => (
                <span
                  key={candidate.name}
                  className={cn(styles.chip, stageChip(candidate.stage))}
                  title={candidate.note}
                >
                  {candidate.name}
                  {candidate.stage !== 'ready' ? ` · ${candidate.stage}` : ''}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <span className={styles.title}>
              Heap
              <span className={styles.tag}>generational — most objects die young</span>
            </span>
            <div className={styles.lanes}>
              {(['eden', 'survivor', 'old'] as const).map((generation) => (
                <div key={generation} className={styles.lane}>
                  <span className={styles.laneName}>{generation}</span>
                  <div className={styles.laneObjects}>
                    {step.heap
                      .filter((object) => object.generation === generation)
                      .map((object) => (
                        <span key={object.id} className={cn(styles.heapObject, laneObjectClass(generation))}>
                          {object.label}
                        </span>
                      ))}
                    {step.heap.every((object) => object.generation !== generation) && (
                      <span className={styles.empty}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <span className={styles.title}>
              Threads
              <span className={styles.tag}>one private stack per thread</span>
            </span>
            {step.threads.length === 0 && <span className={styles.empty}>No threads yet.</span>}
            {step.threads.map((thread) => (
              <div key={thread.name} className={styles.thread}>
                <span className={styles.title}>
                  {thread.name}
                  <span className={styles.tag}>{thread.state}</span>
                </span>
                <div className={styles.frameStack}>
                  {thread.frames.map((frame) => (
                    <span key={frame.method} className={styles.frame}>
                      {frame.method}
                      {frame.note ? ` — ${frame.note}` : ''}
                    </span>
                  ))}
                  {thread.frames.length === 0 && <span className={styles.empty}>stack empty</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <aside className={styles.side}>
        <Card padding="lg">
          <Stack gap={4}>
            <Badge variant="info" size="sm">
              {step.phase}
            </Badge>
            <h2>{step.title}</h2>
            <p>{step.narration}</p>
            <ProgressBar label="Timeline" value={sim.progress} size="md" />
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
              Step {sim.index + 1} of {sim.total}
            </span>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack gap={4}>
            <h3>Console</h3>
            <pre className={styles.console}>
              {step.console.length === 0 ? '—' : step.console.join('\n')}
            </pre>
          </Stack>
        </Card>
      </aside>
    </div>
  );
}
