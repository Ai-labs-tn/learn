import { Badge, Button, Card, ProgressBar, Stack } from '@agiler/ui';

import { cn } from '../../utils/cn';

/**
 * Boot & OS simulator (Phase 1) — a 2D machine that lights up through the boot chain:
 * power → firmware → POST → bootloader → kernel → user space → GUI → login → your app as a process.
 *
 * Structure is data (`bootTimeline`) + a step pointer (`useSimulator`); this component only renders
 * whichever snapshot is current.
 */

import { BOOT_TIMELINE } from './bootTimeline';
import { useSimulator } from '../useSimulator';
import type { PartState, RamRegion } from '../types';
import styles from './BootSimulator.module.css';

const CORES = 4;

function stateClass(state: PartState): string {
  if (state === 'active') return styles.stateActive;
  if (state === 'done') return styles.stateDone;
  if (state === 'idle') return styles.stateIdle;
  return styles.stateOff;
}

function RamView({ region }: { region: RamRegion }) {
  return (
    <div className={styles.region}>
      <span className={styles.regionLabel}>
        <span>{region.label}</span>
        <span>{region.fill}%</span>
      </span>
      <div
        className={cn(
          styles.regionTrack,
          region.id === 'kernel' ? styles.regionKernel : styles.regionUser,
        )}
        style={{ ['--fill' as string]: `${region.fill}%` }}
        data-kind={region.id}
      />
      {region.note && <span className={styles.note}>{region.note}</span>}
    </div>
  );
}

export function BootSimulator() {
  const sim = useSimulator(BOOT_TIMELINE);
  const step = sim.current;
  const partById = (id: string) => step.parts.find((part) => part.id === id);
  const cpu = partById('cpu');
  const ramPart = partById('ram');
  const firmware = partById('firmware');
  const hdd = partById('hdd');
  const ssd = partById('ssd');

  return (
    <div className={styles.grid}>
      <Card padding="lg">
        <div className={styles.machine}>
          {firmware && (
            <div className={cn(styles.part, styles.firmware, stateClass(firmware.state))}>
              <span className={styles.partName}>
                BIOS / UEFI
                <span className={styles.partTag}>non-volatile firmware</span>
              </span>
              {firmware.note && <span className={styles.note}>{firmware.note}</span>}
            </div>
          )}

          {ramPart && (
            <div className={cn(styles.part, stateClass(ramPart.state))}>
              <span className={styles.partName}>
                RAM
                <span className={styles.partTag}>volatile — empty at power on</span>
              </span>
              <div className={styles.regions}>
                {step.ram.map((region) => (
                  <RamView key={region.id} region={region} />
                ))}
              </div>
            </div>
          )}

          {cpu && (
            <div className={cn(styles.part, stateClass(cpu.state))}>
              <span className={styles.partName}>
                CPU
                <span className={styles.partTag}>{CORES} cores</span>
              </span>
              <div className={styles.cores}>
                {Array.from({ length: CORES }, (_, core) => (
                  <span
                    key={core}
                    className={cn(
                      styles.core,
                      cpu.state === 'active' && core === 0 && styles.coreBusy,
                    )}
                  />
                ))}
              </div>
              {cpu.note && <span className={styles.note}>{cpu.note}</span>}
            </div>
          )}

          <div className={styles.diskRow}>
            {[hdd, ssd].map((part) =>
              part ? (
                <div key={part.id} className={cn(styles.part, stateClass(part.state))}>
                  <span className={styles.partName}>
                    {part.label}
                    <span className={styles.partTag}>non-volatile</span>
                  </span>
                  <div className={styles.diskRow}>
                    {part.id === 'hdd' ? (
                      <span className={cn(styles.platter, part.state === 'active' && styles.spinning)} />
                    ) : (
                      <span className={styles.ssdChip} />
                    )}
                    {part.note && <span className={styles.note}>{part.note}</span>}
                  </div>
                </div>
              ) : null,
            )}
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
            <ProgressBar label="Boot progress" value={sim.progress} size="md" />
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
            <h3>Processes in user space</h3>
            <div className={styles.processes}>
              {step.processes.map((process) => (
                <Badge key={process.name} variant="neutral" size="sm">
                  {process.name}
                </Badge>
              ))}
              {step.processes.length === 0 && (
                <span className={styles.stepChip}>No processes yet — the OS is not running.</span>
              )}
            </div>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack gap={4}>
            <h3>Boot log</h3>
            <ol className={styles.log}>
              {step.log.map((line, index) => (
                <li key={`${step.id}-${index}`} className={styles.logItem}>
                  {line}
                </li>
              ))}
            </ol>
          </Stack>
        </Card>
      </aside>
    </div>
  );
}
