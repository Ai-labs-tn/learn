import { Fragment, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion, useScenePointer } from './hooks/motion';
import { initials, SECTION_IDS, yearsOfExperience, firstSentences } from './derive';
import type { Profile } from './types';
import { ResumeDownload } from './ResumeDownload';
import { stripMarks } from './richText';
import s from './portfolio.module.css';

export function Hero({ profile }: { profile: Profile }) {
  const reduced = useReducedMotion();
  const scene = useRef<HTMLDivElement>(null);
  useScenePointer(scene, reduced);
  const [imgOk, setImgOk] = useState(true);
  const { identity, narration } = profile;
  const tagline = identity.tagline || narration?.tagline || identity.headline;
  const pitch = identity.pitch || narration?.elevatorPitch || firstSentences(profile.summary, 2);
  const years = yearsOfExperience(profile);
  const orbit = [...profile.skills].sort((a, b) => b.level - a.level).slice(0, 6);
  const facts = [
    years > 0 && { k: `${years}+`, v: 'years building software' },
    identity.titles[0] && { k: 'Certified', v: identity.titles[0] },

  ].filter(Boolean) as { k: string; v: string }[];
  const words = tagline.split(/\s+/).filter(Boolean);
  return (
    <section id={SECTION_IDS.hero} className={s.hero} aria-labelledby="portfolio-name">
      <div ref={scene} className={s.scene}>
        <div className={`${s.layer} ${s.layerFar}`} aria-hidden="true"><span className={s.orbA} /><span className={s.orbB} /></div>
        <div className={`${s.layer} ${s.layerGrid}`} aria-hidden="true"><div className={s.grid} /></div>
        <div className={s.heroInner}>
          <div className={s.heroCopy}>
            {identity.region && <p className={s.eyebrow}>{identity.region}</p>}
            <h1 id="portfolio-name" className={s.name}>{identity.name}</h1>
            {tagline && (
              <p className={s.tagline}>
                {words.map((w, i) => (
                  // The space must sit outside the inline-block span, where it would otherwise collapse.
                  <Fragment key={`${w}-${i}`}>
                    <span className={s.word} style={{ '--w': i } as CSSProperties}>{w}</span>{' '}
                  </Fragment>
                ))}
              </p>
            )}
            {pitch && <p className={s.pitch}>{stripMarks(pitch)}</p>}
            <div className={s.heroActions}>
              <a className={s.cta} href={`#${SECTION_IDS.projects}`}>View projects</a>
              <a className={s.ctaAlt} href={`#${SECTION_IDS.contact}`}>Get in touch</a>
              <ResumeDownload profile={profile} />
            </div>
          </div>
          <div className={s.stage} aria-hidden="true">
            <div className={s.stageTilt}>
              <span className={`${s.ring} ${s.ring1}`} />
              <span className={`${s.ring} ${s.ring2}`} />
              <div className={s.avatarFrame}>
                {imgOk ? (
                  <img className={s.avatar} src="/portfolio/avatar.jpg" alt="" width={211} height={316} onError={() => setImgOk(false)} />
                ) : (
                  <span className={s.initials}>{initials(identity.name)}</span>
                )}
              </div>
              <div className={s.orbit}>
                {orbit.map((sk, i) => (
                  <span key={sk.name} className={s.orbitSlot} style={{ '--a': `${(360 / orbit.length) * i}deg` } as CSSProperties}>
                    <span className={s.orbitChip}>{sk.name}</span>
                  </span>
                ))}
              </div>
            </div>
            {facts.map((f, i) => (
              <div key={f.k} className={`${s.fact} ${s[`fact${i}` as 'fact0']}`}>
                <strong>{f.k}</strong><span>{f.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
