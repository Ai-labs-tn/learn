import { monthYear, SECTION_IDS } from '../derive';
import type { Profile } from '../types';
import { ResumeDownload } from '../ResumeDownload';
import { Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

export function Education({ profile }: { profile: Profile }) {
  if (!profile.education.length) return null;
  return (
    <SectionShell id={SECTION_IDS.education} eyebrow="Education" title="Foundations">
      <ul className={s.eduList}>
        {profile.education.map((e, i) => (
          <Reveal as="li" key={`${e.institution}-${i}`} i={i} className={s.panel}>
            <h3 className={s.h3}>{e.level || e.institution}</h3>
            <p className={s.body}>{[e.level ? e.institution : '', e.location].filter(Boolean).join(' · ')}</p>
            {(e.start || e.end) && <p className={s.dates}>{[monthYear(e.start), monthYear(e.end)].filter(Boolean).join(' – ')}</p>}
          </Reveal>
        ))}
      </ul>
    </SectionShell>
  );
}

export function Contact({ profile }: { profile: Profile }) {
  const { email, linkedin, phone, website } = profile.contact;
  const safeLinkedin = /^https:\/\//.test(linkedin) ? linkedin : '';
  if (!email && !safeLinkedin && !phone && !website) return null;
  return (
    <SectionShell id={SECTION_IDS.contact} eyebrow="Contact" title="Let’s build something">
      <Reveal className={s.contactPanel}>
        {profile.identity.region && <p className={s.lead}>Based in {profile.identity.region}.</p>}
        <div className={s.contactLinks}>
          {email && <a className={s.cta} href={`mailto:${email}`}>{email}</a>}
          {phone && <a className={s.ctaAlt} href={`tel:${phone.replace(/[^+\d]/g, '')}`}><span className={s.srOnly}>Phone: </span>{phone}</a>}
          {safeLinkedin && <a className={s.ctaAlt} href={safeLinkedin} target="_blank" rel="noopener noreferrer">LinkedIn<span className={s.srOnly}> (opens in a new tab)</span></a>}
          {website && <a className={s.ctaAlt} href={website} target="_blank" rel="noopener noreferrer">Website<span className={s.srOnly}> (opens in a new tab)</span></a>}
          <ResumeDownload profile={profile} />
        </div>
      </Reveal>
    </SectionShell>
  );
}
