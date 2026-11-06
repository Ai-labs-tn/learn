import { monthYear, SECTION_IDS } from '../derive';
import type { Profile } from '../types';
import { Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

export function ExperienceSection({ profile }: { profile: Profile }) {
  if (!profile.experience.length) return null;
  const items = [...profile.experience].sort((a, b) => b.start.localeCompare(a.start));
  return (
    <SectionShell id={SECTION_IDS.experience} eyebrow="Experience" title="Career timeline">
      <ol className={s.timeline}>
        {items.map((e, i) => (
          <Reveal as="li" key={e.id} i={0} side={i % 2 ? 'right' : 'left'} className={`${s.tItem} ${i % 2 ? s.tRight : s.tLeft}`}>
            <span className={`${s.marker} ${e.end ? '' : s.markerNow}`} aria-hidden="true" />
            <div className={s.tCard}>
              <p className={s.dates}>{monthYear(e.start)} – {e.end ? monthYear(e.end) : 'Present'}</p>
              <h3 className={s.h3}>{e.role}</h3>
              <p className={s.body}>{[e.company, e.location].filter(Boolean).join(' · ')}</p>
              {!e.end && <span className={s.chipStrong}>Current role</span>}
            </div>
          </Reveal>
        ))}
      </ol>
    </SectionShell>
  );
}
