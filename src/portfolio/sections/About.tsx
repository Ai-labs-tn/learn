import { useRef } from 'react';
import { useCountUp, useInView, useReducedMotion } from '../hooks/motion';
import { deriveStrengths, SECTION_IDS, yearsOfExperience } from '../derive';
import type { Profile } from '../types';
import { RichText } from '../richText';
import { Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

function Stat({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const reduced = useReducedMotion();
  const shown = useCountUp(value, seen, reduced);
  return (
    <div ref={ref} className={s.stat}>
      <span className={s.statNum} aria-label={`${value}${suffix} ${label}`}><span aria-hidden="true">{shown}{suffix}</span></span>
      <span className={s.statLabel} aria-hidden="true">{label}</span>
    </div>
  );
}

export function About({ profile }: { profile: Profile }) {
  const n = profile.narration;
  const about = n?.about || profile.summary;
  const strengths = deriveStrengths(profile);
  const years = yearsOfExperience(profile);
  const stats = [
    years > 0 && { value: years, suffix: '+', label: 'Years of experience' },
    profile.awards.length > 0 && { value: profile.awards.length, suffix: '', label: 'Awards' },
    profile.projects.length > 0 && { value: profile.projects.length, suffix: '', label: 'Projects' },
    profile.certifications.length > 0 && { value: profile.certifications.length, suffix: '', label: 'Certifications' },
  ].filter(Boolean) as { value: number; suffix: string; label: string }[];
  if (!about && !stats.length && !strengths.length) return null;
  return (
    <SectionShell id={SECTION_IDS.about} eyebrow="About" title="Engineering with a platform mindset">
      {about && <Reveal i={1}><p className={s.lead}><RichText text={about} /></p></Reveal>}
      {n?.careerStory && <Reveal i={2}><p className={s.body}>{n.careerStory}</p></Reveal>}
      {stats.length > 0 && (
        <Reveal i={2} className={s.stats}>
          {stats.map((x) => <Stat key={x.label} {...x} />)}
        </Reveal>
      )}
      {strengths.length > 0 && (
        <ul className={s.strengths}>
          {strengths.map((x, i) => (
            <Reveal as="li" key={x.title} i={i} className={s.panel}>
              <h3 className={s.h3}>{x.title}</h3>
              <p className={s.body}>{x.text}</p>
            </Reveal>
          ))}
        </ul>
      )}
      {profile.domains.length > 0 && (
        <Reveal i={3}>
          <h3 className={`${s.h3} ${s.subTitle}`}>Domains</h3>
          <ul className={s.chips}>{profile.domains.map((d) => <li key={d} className={s.chip}>{d}</li>)}</ul>
        </Reveal>
      )}
    </SectionShell>
  );
}
