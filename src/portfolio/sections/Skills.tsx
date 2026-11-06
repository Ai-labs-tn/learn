import { useState, type CSSProperties } from 'react';
import { SECTION_IDS } from '../derive';
import type { Profile } from '../types';
import { Meter, Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

export function Skills({ profile }: { profile: Profile }) {
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);
  const skills = profile.skills;
  if (!skills.length) return null;
  const groups = [...new Set(skills.map((x) => x.group))];
  const n = skills.length;
  const angle = 360 / n;
  const radius = Math.max(260, Math.round(110 / Math.tan(Math.PI / Math.max(n, 3))) + 30);
  return (
    <SectionShell id={SECTION_IDS.skills} eyebrow="Skills" title="Tools of the trade">
      <div className={s.ringWrap}>
        <div className={s.ringControls}>
          <button type="button" className={s.iconBtn} onClick={() => setStep((v) => v - 1)} aria-label="Rotate skills backward">‹</button>
          <button type="button" className={s.iconBtn} aria-pressed={paused} onClick={() => setPaused((v) => !v)}>{paused ? 'Resume' : 'Pause'}</button>
          <button type="button" className={s.iconBtn} onClick={() => setStep((v) => v + 1)} aria-label="Rotate skills forward">›</button>
        </div>
        <div className={s.ringStage} aria-hidden="true" style={{ '--r': radius } as CSSProperties} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
          <div className={`${s.ringSpin} ${paused ? s.paused : ''}`}>
            <div className={s.ringStep} style={{ transform: `rotateY(${step * -angle}deg)` }}>
              {skills.map((sk, i) => (
                <div key={sk.name} className={s.ringCard} style={{ transform: `rotateY(${i * angle}deg) translateZ(${radius}px)` }}>
                  <span className={s.ringGroup}>{sk.group}</span>
                  <strong className={s.ringName}>{sk.name}</strong>
                  <Meter name={sk.name} level={sk.level} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={s.skillGroups}>
        {groups.map((g, gi) => (
          <Reveal key={g} i={gi} className={s.panel}>
            <h3 className={s.h3}>{g}</h3>
            <ul className={s.skillList}>
              {skills.filter((x) => x.group === g).map((x) => (
                <li key={x.name} className={s.skillRow}>
                  <span className={s.skillName}>{x.name}</span>
                  <Meter name={x.name} level={x.level} />
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}

