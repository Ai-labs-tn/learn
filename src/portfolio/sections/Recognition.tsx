import { monthYear, SECTION_IDS } from '../derive';
import type { Profile } from '../types';
import { Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

export function Recognition({ profile }: { profile: Profile }) {
  const { awards, certifications, highlights } = profile;
  if (!awards.length && !certifications.length && !highlights.length) return null;
  return (
    <SectionShell id={SECTION_IDS.recognition} eyebrow="Recognition" title="Awards, certifications & highlights">
      {awards.length > 0 && (
        <>
          <h3 className={s.h3}>Awards</h3>
          <ul className={s.deck}>
            {awards.map((a, i) => (
              <Reveal as="li" key={`${a.title}-${i}`} i={i % 4} className={s.award}>
                <p className={s.dates}>{a.date ? monthYear(a.date) : 'Recognised'}</p>
                <h4 className={s.h4}>{a.title}</h4>
                {a.description && <p className={s.body}>{a.description}</p>}
              </Reveal>
            ))}
          </ul>
        </>
      )}
      {certifications.length > 0 && (
        <>
          <h3 className={s.h3}>Certifications</h3>
          <ul className={s.badges}>
            {certifications.map((c) => (
              <Reveal as="li" key={c.name} className={s.badge}>
                <span className={s.seal} aria-hidden="true">✓</span>
                <span>
                  <strong>{c.name}</strong>
                  <span className={s.badgeMeta}>{[c.issuer, c.validUntil ? `Valid until ${monthYear(c.validUntil)}` : ''].filter(Boolean).join(' · ')}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </>
      )}
      {highlights.length > 0 && (
        <>
          <h3 className={s.h3}>Highlights</h3>
          <ul className={s.callouts}>
            {highlights.map((h, i) => <Reveal as="li" key={h} i={i} className={s.callout}>{h}</Reveal>)}
          </ul>
        </>
      )}
    </SectionShell>
  );
}
