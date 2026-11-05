import { useEffect, useMemo, useState } from 'react';

/**
 * The machine, drawn in colour on the lecturer's whiteboard.
 *
 * Parts appear when the presenter first introduces them (stroke animation), stay as faded colour
 * afterwards, and get fresh ink + the pointer when they are the focus. The board is explorable:
 * clicking a part opens a chalk glossary card (with "replay its chapter") instead of silently
 * rewinding the lesson.
 */

import { cn } from '../../utils/cn';
import { useTypewriter } from '../whiteboard/useTypewriter';
import { BOOT_TIMELINE } from './bootTimeline';
import type { BootStep } from '../types';
import styles from './BootMachine.module.css';

/* --- Geometry (viewBox 1040 × 620) ----------------------------------------- */

const L = {
  board: { x: 146, y: 64, w: 610, h: 496 },
  psu: { x: 28, y: 252, w: 86, h: 96 },
  cpu: { x: 176, y: 100, w: 136, h: 124 },
  ram: { x: 352, y: 100, w: 280, h: 140 },
  firmware: { x: 176, y: 296, w: 136, h: 64 },
  hdd: { cx: 412, cy: 372, r: 44 },
  ssd: { x: 480, y: 328, w: 130, h: 88 },
  monitor: { x: 812, y: 170, w: 210, h: 290 },
  screen: { x: 826, y: 184, w: 182, h: 236 },
} as const;

const FLOWS: Record<string, string> = {
  'psu-board': 'M114 300 H146',
  'firmware-cpu': 'M244 294 V228',
  'disk-cpu': 'M478 326 C380 298 282 282 250 230',
  'disk-ram': 'M545 326 C540 272 500 222 492 176',
  'disk-user': 'M545 330 C594 302 622 260 602 214',
};

const ANCHORS: Record<string, { x: number; y: number }> = {
  board: { x: 451, y: 312 },
  psu: { x: 71, y: 300 },
  cpu: { x: 244, y: 162 },
  ram: { x: 492, y: 170 },
  'ram.kernel': { x: 492, y: 135 },
  'ram.user': { x: 492, y: 205 },
  firmware: { x: 244, y: 328 },
  hdd: { x: 412, y: 372 },
  ssd: { x: 545, y: 372 },
  monitor: { x: 917, y: 315 },
};

const CIRCLES: Record<string, { rx: number; ry: number }> = {
  cpu: { rx: 88, ry: 84 },
  'ram.kernel': { rx: 148, ry: 46 },
  'ram.user': { rx: 148, ry: 46 },
  monitor: { rx: 122, ry: 162 },
  ram: { rx: 156, ry: 88 },
};

const NOTE_OFFSET: Record<string, { x: number; y: number }> = {
  board: { x: 0, y: 32 },
  cpu: { x: 0, y: 108 },
  ram: { x: 0, y: 100 },
  'ram.kernel': { x: 0, y: 66 },
  'ram.user': { x: 0, y: 52 },
  firmware: { x: 0, y: 54 },
  ssd: { x: 0, y: 88 },
  hdd: { x: -84, y: 24 },
  monitor: { x: -136, y: -20 },
};

const PROCESS_SHORT: Record<string, string> = {
  'init / smss.exe': 'init',
  services: 'svc',
  shell: 'shell',
  'my-app (OS process)': 'app',
  login: 'login',
};

/** Per-part colour identity — a colourful diagram, not a pencil sketch. */
const C = {
  ink: 'var(--color-text-primary)',
  cpu: 'var(--color-primary)',
  cpuSoft: 'var(--color-primary-soft)',
  ram: 'var(--color-info)',
  infoSoft: 'var(--color-info-soft)',
  kernel: 'var(--color-primary)',
  primarySoft: 'var(--color-primary-soft)',
  ssd: 'var(--color-success)',
  successSoft: 'var(--color-success-soft)',
  hdd: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-soft)',
  firmware: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  psu: 'var(--color-warning)',
};

const GLOSSARY: Record<string, string> = {
  board: 'The motherboard — every part of the machine is wired together here.',
  psu: 'The power supply. It energises the whole board the moment you press the button.',
  cpu: 'The processor: 4 cores that execute instructions. The lit core is the one running your app.',
  ram: 'Volatile memory — wakes completely empty. Kernel space (top) is protected; user space (bottom) is where every program lives.',
  firmware: 'The BIOS/UEFI chip. Non-volatile: it hands the CPU its very first instruction at power-on.',
  hdd: 'Magnetic disk — non-volatile but slow. The classic drive.',
  ssd: 'Flash storage — non-volatile and fast. The OS and your programs live here until they run.',
  monitor: 'The screen. The boot log types here; the GUI, the login prompt and your apps appear on it.',
};

const PART_LABEL: Record<string, string> = {
  board: 'the machine',
  psu: 'PSU',
  cpu: 'CPU',
  ram: 'RAM',
  firmware: 'BIOS / UEFI',
  hdd: 'HDD',
  ssd: 'SSD',
  monitor: 'screen',
};

/* --- Reveal bookkeeping ----------------------------------------------------- */

function revealedAt(index: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= index; i++) {
    BOOT_TIMELINE[i]?.focus.reveals?.forEach((part) => set.add(part));
  }
  return set;
}

function jumpIndexFor(part: string): number {
  const at = BOOT_TIMELINE.findIndex(
    (candidate) => candidate.focus.part === part || candidate.focus.reveals?.includes(part),
  );
  return at < 0 ? 0 : at;
}

const pctX = (x: number): string => `${(x / 1040) * 100}%`;
const pctY = (y: number): string => `${(y / 620) * 100}%`;
const pctW = (w: number): string => `${(w / 1040) * 100}%`;
const pctH = (h: number): string => `${(h / 620) * 100}%`;

/** The board-space point the phone camera should centre on for this step. */
export function focusAnchorOf(step: BootStep): { x: number; y: number } {
  return ANCHORS[step.focus.part] ?? ANCHORS.board;
}

/* --- Component ---------------------------------------------------------------- */

export function BootMachine({
  step,
  index,
  onJump,
}: {
  step: BootStep;
  index: number;
  onJump: (at: number) => void;
}) {
  const revealed = useMemo(() => revealedAt(index), [index]);
  const [inspect, setInspect] = useState<string | null>(null);
  const focus = step.focus;
  const fresh = (part: string): boolean => !!focus.reveals?.includes(part);
  const stateOf = (part: string): string =>
    !revealed.has(part) ? styles.hidden : focus.part === part ? styles.focus : styles.shown;

  // Close the glossary card whenever the lesson moves.
  useEffect(() => setInspect(null), [index]);

  const cpuActive = step.parts.find((part) => part.id === 'cpu')?.state === 'active';
  const hddActive = step.parts.find((part) => part.id === 'hdd')?.state === 'active';
  const kernel = step.ram[0];
  const user = step.ram[1];
  const anchor = ANCHORS[focus.part] ?? ANCHORS.board;
  const noteAt = NOTE_OFFSET[focus.part] ?? { x: 0, y: 40 };
  const lastLog = step.log[step.log.length - 1] ?? '';
  const typedLog = useTypewriter(lastLog, 22);
  const monitorLive = revealed.has('monitor');
  const inspectInfo = inspect ? { part: inspect, chapter: jumpIndexFor(inspect) } : null;
  const flowPath = focus.flow ? FLOWS[focus.flow] : undefined;

  const g = (part: string): string => cn(styles.layer, stateOf(part), fresh(part) && styles.fresh);

  return (
    <>
      <svg className={styles.ink} viewBox="0 0 1040 620" role="img" aria-label="The machine, drawn in colour">
        <defs>
          <filter id="ink-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
          </filter>
          <pattern id="ink-hatch-primary" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-primary)" strokeWidth="2.4" opacity="0.55" />
          </pattern>
          <pattern id="ink-hatch-info" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-info)" strokeWidth="2.4" opacity="0.55" />
          </pattern>
        </defs>

        {/* Sketched parts (wobbled, coloured ink) */}
        <g filter="url(#ink-rough)">
          {/* PSU */}
          <g className={g('psu')}>
            <rect
              x={L.psu.x} y={L.psu.y} width={L.psu.w} height={L.psu.h} rx={9}
              fill={C.warningSoft} stroke={C.psu} strokeWidth={2.6} pathLength={1}
            />
            <path
              d="M74 272 l-12 22 h9 l-9 22 20-26 h-10 l12-18 z"
              fill={C.hdd} className={fresh('psu') ? styles.freshFill : undefined}
            />
            <text x={71} y={336} textAnchor="middle" fontSize={11} className={styles.inkText} fill={C.psu}>
              PSU
            </text>
          </g>

          {/* Board outline */}
          <g className={g('board')}>
            <rect
              x={L.board.x} y={L.board.y} width={L.board.w} height={L.board.h} rx={18}
              fill={C.primarySoft} fillOpacity={0.35} stroke={C.ink} strokeWidth={2.6} strokeOpacity={0.75} pathLength={1}
            />
            <text x={170} y={92} fontSize={12} className={styles.inkText} fill="var(--color-text-secondary)">
              the machine — one case, one brain
            </text>
          </g>

          {/* CPU */}
          <g className={g('cpu')}>
            <rect
              x={L.cpu.x} y={L.cpu.y} width={L.cpu.w} height={L.cpu.h} rx={10}
              fill={C.cpuSoft} stroke={C.cpu} strokeWidth={2.6} pathLength={1}
            />
            {[0, 1, 2, 3].map((core) => (
              <rect
                key={core}
                x={190 + (core % 2) * 60}
                y={114 + Math.floor(core / 2) * 50}
                width={54} height={44} rx={6}
                fill={cpuActive && core === 0 ? C.cpu : 'var(--color-surface)'}
                stroke={C.cpu} strokeWidth={1.8}
                className={cn(fresh('cpu') && styles.freshFill, cpuActive && core === 0 && styles.coreActive)}
              />
            ))}
            <text x={244} y={244} textAnchor="middle" fontSize={11} fill={C.cpu} className={styles.inkTextStrong}>
              CPU · 4 cores
            </text>
          </g>

          {/* RAM */}
          <g className={g('ram')}>
            <rect
              x={L.ram.x} y={L.ram.y} width={L.ram.w} height={L.ram.h} rx={10}
              fill="var(--color-surface)" stroke={C.ram} strokeWidth={2.6} pathLength={1}
            />
            <line x1={352} y1={170} x2={632} y2={170} stroke={C.ram} strokeWidth={1.6} pathLength={1} />
            <rect
              x={358} y={106} height={58} rx={4}
              width={Math.max(3, (268 * kernel.fill) / 100)}
              fill="url(#ink-hatch-primary)" className={cn(styles.ramFill, fresh('ram') && styles.freshFill)}
            />
            <rect
              x={358} y={176} height={58} rx={4}
              width={Math.max(3, (268 * user.fill) / 100)}
              fill="url(#ink-hatch-info)" className={styles.ramFill}
            />
            <text x={362} y={120} fontSize={10.5} fill={C.kernel} className={styles.inkTextStrong}>kernel space</text>
            <text x={362} y={190} fontSize={10.5} fill={C.ram} className={styles.inkTextStrong}>user space</text>
            <text x={624} y={120} textAnchor="end" fontSize={10} fill={C.kernel} className={styles.inkText}>{kernel.fill}%</text>
            <text x={624} y={190} textAnchor="end" fontSize={10} fill={C.ram} className={styles.inkText}>{user.fill}%</text>
            <text x={492} y={258} textAnchor="middle" fontSize={11} fill={C.ram} className={styles.inkTextStrong}>
              RAM · volatile — wakes empty
            </text>
            {/* Processes drawn onto user space */}
            {step.processes.map((process, position) => {
              const chipX = 360 + position * 62;
              const isNew =
                position === step.processes.length - 1 &&
                (focus.part === 'ram.user' || focus.flow === 'disk-user');
              return (
                <g key={process.name} className={position === step.processes.length - 1 ? styles.freshFill : undefined}>
                  <rect
                    x={chipX} y={196} width={56} height={22} rx={6}
                    fill="var(--color-surface)"
                    stroke={isNew ? 'var(--color-success)' : C.ram} strokeWidth={1.8}
                  />
                  <text x={chipX + 28} y={210} textAnchor="middle" fontSize={9} fill={C.ram} className={styles.inkTextStrong}>
                    {PROCESS_SHORT[process.name] ?? process.name.slice(0, 5)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Firmware chip */}
          <g className={g('firmware')}>
            <rect
              x={L.firmware.x} y={L.firmware.y} width={L.firmware.w} height={L.firmware.h} rx={8}
              fill={C.dangerSoft} stroke={C.firmware} strokeWidth={2.4} strokeDasharray="5 4"
            />
            <text x={244} y={324} textAnchor="middle" fontSize={10.5} fill={C.firmware} className={styles.inkTextStrong}>
              BIOS / UEFI
            </text>
            <text x={244} y={344} textAnchor="middle" fontSize={9} fill={C.firmware} className={styles.inkText}>
              non-volatile
            </text>
          </g>

          {/* Disks */}
          <g className={g('hdd')}>
            <circle cx={L.hdd.cx} cy={L.hdd.cy} r={L.hdd.r} fill={C.warningSoft} stroke={C.hdd} strokeWidth={2.6} pathLength={1} />
            <circle cx={L.hdd.cx} cy={L.hdd.cy} r={10} fill="none" stroke={C.hdd} strokeWidth={1.6} />
            <line
              x1={L.hdd.cx} y1={L.hdd.cy} x2={L.hdd.cx + L.hdd.r - 6} y2={L.hdd.cy}
              stroke={C.hdd} strokeWidth={2.4}
              className={hddActive ? styles.spinLine : undefined}
              style={hddActive ? { transformOrigin: `${L.hdd.cx}px ${L.hdd.cy}px` } : undefined}
            />
            <text x={412} y={438} textAnchor="middle" fontSize={10.5} fill={C.hdd} className={styles.inkTextStrong}>
              HDD · magnetic
            </text>
          </g>
          <g className={g('ssd')}>
            <rect
              x={L.ssd.x} y={L.ssd.y} width={L.ssd.w} height={L.ssd.h} rx={8}
              fill={C.successSoft} stroke={C.ssd} strokeWidth={2.6} pathLength={1}
            />
            {[0, 1, 2, 3].map((cell) => (
              <line
                key={cell}
                x1={500 + cell * 26} y1={340} x2={500 + cell * 26} y2={404}
                stroke={C.ssd} strokeWidth={1.4} opacity={0.65}
              />
            ))}
            <text x={545} y={438} textAnchor="middle" fontSize={10.5} fill={C.ssd} className={styles.inkTextStrong}>
              SSD · flash
            </text>
          </g>

          {/* Monitor shell (content is HTML, layered above) */}
          <g className={g('monitor')}>
            <rect
              x={L.monitor.x} y={L.monitor.y} width={L.monitor.w} height={L.monitor.h} rx={12}
              fill="var(--color-surface)" stroke={C.ink} strokeWidth={2.6} pathLength={1}
            />
            <rect
              x={L.screen.x} y={L.screen.y} width={L.screen.w} height={L.screen.h} rx={6}
              fill="var(--color-terminal-background)" stroke={C.ink} strokeWidth={1.6} className={styles.crtGlow}
            />
            <line x1={917} y1={460} x2={917} y2={476} stroke={C.ink} strokeWidth={2.2} />
            <line x1={882} y1={476} x2={952} y2={476} stroke={C.ink} strokeWidth={2.2} />
            <text x={917} y={492} textAnchor="middle" fontSize={10.5} fill="var(--color-text-secondary)" className={styles.inkText}>
              screen
            </text>
          </g>
        </g>
      </svg>

      {/* The machine's screen content: typed log, desktop icons, login, app window. */}
        {monitorLive && (
          <div
            className={styles.monitorContent}
            style={{
              left: pctX(L.screen.x),
              top: pctY(L.screen.y),
              width: pctW(L.screen.w),
              height: pctH(L.screen.h),
            }}
          >
            {revealed.has('gui-icons') && (
              <div className={cn(styles.guiIcons, fresh('monitor') && styles.freshFill)}>
                {[0, 1, 2].map((icon) => (
                  <span key={icon} className={styles.guiIcon} />
                ))}
              </div>
            )}
            <div className={styles.monitorLog}>
              {step.log.slice(0, -1).map((line, position) => (
                <div key={`${line}-${position}`} className={cn(styles.logLine, styles.logOld)}>
                  {line}
                </div>
              ))}
              {lastLog && <div className={cn(styles.logLine, styles.logNew)}>{typedLog}</div>}
            </div>
            {revealed.has('login-prompt') && (
              <div className={cn(styles.loginBox, fresh('login-prompt') && styles.freshFill)}>
                login
                <span className={styles.loginLine} />
                <span className={styles.loginLine} />
              </div>
            )}
            {revealed.has('app-window') && (
              <div className={cn(styles.appWindow, fresh('app-window') && styles.freshFill)}>
                <div className={styles.appTitle}>my-app</div>
                <span className={styles.appLine} />
                <span className={styles.appLine} />
                <span className={styles.appLine} />
              </div>
            )}
          </div>
        )}

      {/* Presenter layer: flowing particles, chalk circle, note, pointer */}
      <svg className={styles.inkOverlay} viewBox="0 0 1040 620" aria-hidden="true">
        {flowPath && (
          <g>
            <path
              d={flowPath}
              fill="none" stroke="var(--color-primary)" strokeWidth={2} opacity={0.4}
              strokeDasharray="2 7"
            />
            {[0, 1, 2].map((particle) => (
              <circle key={particle} r={3.6} fill="var(--color-primary)">
                <animateMotion
                  dur="1.5s"
                  begin={`${particle * 0.5}s`}
                  repeatCount="indefinite"
                  path={flowPath}
                />
              </circle>
            ))}
          </g>
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

      {/* Click-to-explore: hovering outlines the part, clicking opens its chalk glossary card. */}
      <svg className={styles.inkOverlay} viewBox="0 0 1040 620" aria-hidden="true">
        {(
          [
            ['cpu', L.cpu],
            ['ram', L.ram],
            ['firmware', L.firmware],
            ['ssd', L.ssd],
            ['monitor', L.monitor],
          ] as const
        ).map(([part, rect]) => (
          <rect
            key={part}
            className={styles.hit}
            x={rect.x} y={rect.y} width={rect.w} height={rect.h}
            onClick={() => setInspect(part)}
          />
        ))}
        <circle
          className={styles.hit}
          cx={L.hdd.cx} cy={L.hdd.cy} r={L.hdd.r + 6}
          onClick={() => setInspect('hdd')}
        />
      </svg>

      {/* Chalk glossary card for the inspected part */}
      {inspectInfo && (
        <div
          className={styles.glossaryCard}
          style={{
            left: `min(${pctX(anchor.x + 24)}, calc(100% - 250px))`,
            top: pctY(Math.min(anchor.y + 26, 470)),
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