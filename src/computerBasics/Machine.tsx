import { useId } from 'react';
import type { Part } from './story';
import s from '../player/player.module.css';

export function Machine({ scene, focus, powered, event, failed, readBlock, onPower, transfer }: {
  scene: number; focus: Part; powered: boolean; event: number; failed: boolean; readBlock: number | null; onPower: () => void;
  transfer?: 'storage-ram' | 'cpu-ram' | 'firmware-cpu';
}) {
  const uid = useId().replace(/:/g, '');
  const views: Record<Part, string> = { overview: '0 0 1080 650', cpu: '190 80 530 390', ram: '415 70 460 430', firmware: '300 230 440 330', storage: '680 140 390 480' };
  const moving = powered && (scene === 1 || (scene === 3 && event > 0) || (scene === 4 && event > 0) || (scene === 7 && readBlock !== null));
  return (
    <svg className={s.machine} viewBox={views[focus]} role="img" aria-labelledby={`${uid}-title ${uid}-desc`}>
      <title id={`${uid}-title`}>Connected computer interior — {focus === 'overview' ? 'whole machine' : focus + ' inspection'}</title>
      <desc id={`${uid}-desc`}>An open case containing a motherboard, CPU socket, RAM modules, firmware storage, power supply, SATA storage devices and a network adapter. Highlights illustrate activity, not literal electrical timing. {failed ? 'Memory check failed; startup is stopped.' : powered ? 'Power is on.' : 'Power is off; files remain in storage.'}</desc>
      <defs>
        <linearGradient id={`${uid}-metal`} x2="0.8" y2="1"><stop stopColor="var(--color-surface-hover)" /><stop offset="1" stopColor="var(--color-background)" /></linearGradient>
        <pattern id={`${uid}-vents`} width="12" height="12" patternUnits="userSpaceOnUse"><path d="M2 0v8" stroke="var(--color-border-strong)" strokeWidth="3" /></pattern>
      </defs>
      {/* Case rim and base: physical parts, not architecture boxes. */}
      <path d="M28 42L1020 42 1050 72 1050 604 1018 632 28 632 10 610 10 66Z" fill={`url(#${uid}-metal)`} stroke="var(--color-border-strong)" strokeWidth="3" />
      <path d="M28 42L54 70H1020M1050 72L1020 94V603L1018 632" fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
      <rect x="57" y="82" width="665" height="505" rx="12" fill="var(--color-success-soft)" stroke="var(--color-border-strong)" strokeWidth="3" />
      {/* Copper routing and mounting bosses. */}
      <g fill="none" stroke="var(--color-border-strong)" strokeWidth="1" opacity="0.45">
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${160 + i * 7} 156v${65 + i * 4}l60 58v${90 - i * 3}h200l80 78v58`} />)}
        {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${460 + i * 7} 175h${85 - i * 3}v${192 + i * 5}l-70 50H280`} />)}
      </g>
      {[ [80,105], [695,105], [80,562], [695,562], [390,105], [390,562] ].map(([x,y]) => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="8" fill="var(--color-surface-hover)" stroke="var(--color-border-strong)" /><path d={`M${x-4} ${y}h8M${x} ${y-4}v8`} stroke="var(--color-border-strong)" /></g>)}
      <text x="96" y="546" className={s.boardLabel}>MOTHERBOARD • illustrative PC</text>
      {/* Rear I/O sockets and network adapter. Ports are not TCP ports. */}
      <g fill="var(--color-surface-hover)" stroke="var(--color-border-strong)" strokeWidth="2">
        {[128,185,242,299].map(y => <rect key={y} x="44" y={y} width="48" height="40" rx="3" />)}
        <rect x="112" y="451" width="360" height="26" rx="3" /><rect x="112" y="493" width="275" height="20" rx="3" />
        <path d="M100 414H435V451H100Z" fill="var(--color-success-soft)" /><rect x="104" y="420" width="38" height="28" /><rect x="181" y="420" width="58" height="23" />
      </g>
      <text x="265" y="438" className={s.smallLabel}>Network adapter</text>
      {/* VRM chokes and capacitors next to the processor socket. */}
      {[0,1,2,3,4,5].map(i => <g key={i} fill="var(--color-surface-hover)" stroke="var(--color-border-strong)"><rect x={177+i*37} y="126" width="26" height="22" rx="2" /><ellipse cx={179+i*37} cy="166" rx="9" ry="5" /><path d={`M${170+i*37} 166v20a9 5 0 0 0 18 0v-20`} /></g>)}
      {/* Processor package inside a retention socket. */}
      <g className={focus === 'cpu' ? s.focusPart : undefined}>
        <rect x="218" y="206" width="245" height="176" rx="8" fill="var(--color-surface-sunken)" stroke="var(--color-border-strong)" strokeWidth="5" />
        <path d="M230 211V371H451V214M463 212h18v151h-18" fill="none" stroke="var(--color-border-strong)" strokeWidth="4" />
        {Array.from({ length: 18 }, (_,i) => <path key={i} d={`M${230+i*12} 198v8M${230+i*12} 382v8`} stroke="var(--color-warning)" strokeWidth="3" />)}
        <rect x="247" y="225" width="184" height="139" rx="8" fill={`url(#${uid}-metal)`} stroke="var(--color-border-strong)" strokeWidth="2" />
        <text x="339" y="258" textAnchor="middle" className={s.label}>CPU / PROCESSOR</text>
        {scene >= 2 && focus === 'cpu' ? <g>
          <rect x="263" y="274" width="151" height="73" rx="4" fill="var(--color-surface)" stroke="var(--color-primary)" />
          <rect x="269" y="280" width="66" height="36" rx="3" fill="var(--color-primary-soft)" /><text x="301" y="303" textAnchor="middle" className={s.smallLabel}>Core</text>
          <text x="344" y="296" className={s.smallLabel}>Registers</text>
          {[0,1,2].map(i => <rect key={i} x={343+i*21} y="304" width="16" height="12" fill="var(--color-primary-soft)" stroke="var(--color-primary)" />)}
          {scene === 4 && event >= 2 && <text x="351" y="314" className={s.smallLabel}>17</text>}
          <text x="339" y="336" textAnchor="middle" className={s.smallLabel}>Cache • simplified cutaway</text>
        </g> : <text x="339" y="309" textAnchor="middle" className={s.smallLabel}>{powered ? 'Ready to execute' : 'No execution'}</text>}
      </g>
      {/* Two long DIMMs, sockets and retaining clips. */}
      {[526,599].map((x,i) => <g key={x} className={focus === 'ram' ? s.focusPart : undefined}>
        <rect x={x-6} y="157" width="48" height="262" rx="4" fill="var(--color-surface-sunken)" stroke="var(--color-border-strong)" strokeWidth="3" />
        <rect x={x} y="166" width="35" height="245" rx="2" fill="var(--color-success-soft)" stroke={failed ? 'var(--color-danger)' : 'var(--color-border-strong)'} strokeWidth={failed ? 4 : 2} />
        {[0,1,2,3,4,5].map(n => <rect key={n} x={x+5} y={176+n*36} width="25" height="27" rx="2" fill="var(--color-surface-sunken)" stroke="var(--color-border-strong)" />)}
        <path d={`M${x-9} 151h52v13M${x-9} 413v15h52`} stroke="var(--color-border-strong)" fill="none" strokeWidth="4" />
        <text x={x+17} y="447" textAnchor="middle" className={s.label}>RAM {i+1}</text>
      </g>)}
      {/* Firmware IC, with pins and a physical controller on the board. */}
      <g className={focus === 'firmware' ? s.focusPart : undefined}>
        <rect x="298" y="477" width="95" height="42" rx="3" fill="var(--color-terminal-background)" stroke="var(--color-border-strong)" />
        {Array.from({ length: 8 }, (_,i) => <path key={i} d={`M${305+i*11} 468v9M${305+i*11} 519v9`} stroke="var(--color-warning)" strokeWidth="3" />)}
        <text x="346" y="504" textAnchor="middle" className={s.chipLabel}>Firmware</text>
      </g>
      <rect x="632" y="484" width="47" height="42" rx="4" fill="var(--color-surface-sunken)" stroke="var(--color-border-strong)" /><text x="596" y="548" className={s.smallLabel}>Storage controller</text>
      {/* Power supply and routed cables; data cables shown separately. */}
      <rect x="780" y="81" width="220" height="135" rx="6" fill={`url(#${uid}-metal)`} stroke="var(--color-border-strong)" strokeWidth="3" />
      <circle cx="837" cy="144" r="43" fill="var(--color-surface-sunken)" stroke="var(--color-border-strong)" />
      <g transform="translate(837 144)"><g className={powered ? s.fan : undefined}>{[0,60,120,180,240,300].map(a => <path key={a} transform={`rotate(${a})`} d="M0 0Q-28-10-30-30Q0-38 12-10Z" fill="var(--color-border-strong)" />)}</g></g>
      <circle cx="837" cy="144" r="10" fill="var(--color-surface)" /><text x="900" y="138" className={s.label}>PSU</text><text x="891" y="162" className={s.smallLabel}>Power supply</text>
      <path d="M786 191C732 209 754 129 702 130H477V209" className={powered ? s.powerCableOn : s.powerCable} />
      <path d="M798 205C750 252 751 322 807 335" className={powered ? s.powerCableOn : s.powerCable} />
      <path d="M680 508C744 508 717 377 805 377M680 516C755 575 760 539 808 522" className={s.dataCable} />
      {/* SATA SSD metal enclosure and exposed HDD mechanism. */}
      <g className={focus === 'storage' ? s.focusPart : undefined}>
        <rect x="807" y="277" width="196" height="137" rx="8" fill={`url(#${uid}-metal)`} stroke="var(--color-border-strong)" strokeWidth="3" />
        <text x="829" y="302" className={s.label}>SSD • FLASH</text>
        {[0,1,2,3].map(i => <rect key={i} x={829+i%2*78} y={315+Math.floor(i/2)*38} width="60" height="27" rx="3" fill={readBlock !== null && i === readBlock%4 ? 'var(--color-primary-soft)' : 'var(--color-surface-sunken)'} stroke="var(--color-primary)" />)}
        <rect x="807" y="448" width="196" height="152" rx="8" fill={`url(#${uid}-metal)`} stroke="var(--color-border-strong)" strokeWidth="3" />
        <text x="819" y="471" className={s.label}>HDD • MECHANICAL</text>
        <circle cx="886" cy="533" r="48" fill="var(--color-surface-hover)" stroke="var(--color-border-strong)" strokeWidth="2" />
        {[20,30,40].map(r => <circle key={r} cx="886" cy="533" r={r} fill="none" stroke="var(--color-border)" />)}
        <g className={powered ? s.platter : undefined}><path d="M886 485V581M838 533H934" stroke="var(--color-border-strong)" /></g>
        <circle cx="886" cy="533" r="9" fill="var(--color-surface-sunken)" />
        <g transform={`rotate(${readBlock === null ? 0 : (readBlock-7)*3} 974 566)`} className={s.head}><path d="M974 566L878 519L888 509L977 554Z" fill="var(--color-border-strong)" /><circle cx="974" cy="566" r="11" fill="var(--color-surface)" stroke="var(--color-border-strong)" /></g>
      </g>
      <text x="825" y="435" className={s.smallLabel}>Saved files retained without power</text>
      {powered && transfer && <g fill="none" stroke="var(--color-info)" strokeWidth="5" className={s.activity}>
        {transfer === 'storage-ram' && <path d="M807 377C717 377 744 508 680 508H650V340H635" />}
        {transfer === 'cpu-ram' && <path d="M431 291H500V270H526" />}
        {transfer === 'firmware-cpu' && <path d="M346 477V397H340V364" />}
      </g>}
      {/* Instruction/data highlights follow conceptual interconnect routes, not the PSU cable. */}
      {moving && <g fill="none" strokeWidth="5" className={s.activity}>
        {scene === 1 && <path d="M785 191C732 209 754 129 702 130H477V209" stroke="var(--color-warning)" />}
        {scene === 3 && <path d="M346 477V397H340V364" stroke="var(--color-primary)" />}
        {scene === 4 && <path d="M431 291H500V270H526" stroke="var(--color-info)" />}
        {scene === 7 && <path d="M807 377C717 377 744 508 680 508H650V340H635" stroke="var(--color-info)" />}
      </g>}
      <g onClick={scene === 0 ? onPower : undefined} className={s.physicalButton}>
        <circle cx="70" cy="609" r="16" fill={powered ? 'var(--color-success)' : 'var(--color-surface)'} stroke="var(--color-border-strong)" strokeWidth="2" />
        <path d="M70 598v11M64 603a9 9 0 1 0 12 0" fill="none" stroke={powered ? 'var(--color-on-success)' : 'var(--color-text-primary)'} strokeWidth="2" />
        <text x="97" y="615" className={s.label}>{powered ? 'POWER ON' : 'POWER'}</text>
      </g>
    </svg>
  );
}
