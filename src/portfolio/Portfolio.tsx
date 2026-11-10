import { useEffect, useRef } from 'react';
import { Button, ThemeToggle } from '@agiler/ui';
import authStyles from '../auth/auth.module.css';
import { useProfile } from './hooks/useProfile';
import { useReducedMotion, useScrollVars } from './hooks/motion';
import { SECTION_IDS } from './derive';
import { Hero } from './Hero';
import { About } from './sections/About';
import { Skills } from './sections/Skills';
import { ExperienceSection } from './sections/Experience';
import { Projects } from './sections/Projects';
import { Recognition } from './sections/Recognition';
import { Contact, Education } from './sections/EducationContact';
import s from './portfolio.module.css';

type Props = { onLogin: () => void; notice?: string; onDismissNotice?: () => void };

export function Portfolio({ onLogin, notice, onDismissNotice }: Props) {
  const { profile } = useProfile();
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useScrollVars(root, reduced);
  useEffect(() => {
    const on = () => { if (root.current) root.current.dataset.hidden = String(document.hidden); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const nav = [
    { id: SECTION_IDS.about, label: 'About', show: Boolean(profile.summary || profile.narration?.about || profile.skills.length) },
    { id: SECTION_IDS.skills, label: 'Skills', show: profile.skills.length > 0 },
    { id: SECTION_IDS.experience, label: 'Experience', show: profile.experience.length > 0 },
    { id: SECTION_IDS.projects, label: 'Projects', show: profile.projects.length > 0 },
    { id: SECTION_IDS.recognition, label: 'Recognition', show: profile.awards.length + profile.certifications.length + profile.highlights.length > 0 },
    { id: SECTION_IDS.education, label: 'Education', show: profile.education.length > 0 },
    { id: SECTION_IDS.contact, label: 'Contact', show: Boolean(profile.contact.email || profile.contact.linkedin || profile.contact.phone) },
  ].filter((x) => x.show);

  return (
    <div ref={root} className={s.root}>
      <a className={s.skip} href="#portfolio-main">Skip to content</a>
      {notice && (
        <div className={s.notice} role="status">
          <span>{notice}</span>
          {onDismissNotice && <Button variant="outline" onClick={onDismissNotice}>Dismiss</Button>}
        </div>
      )}
      <header className={s.header}>
        <div className={s.headerRow}>
          <a className={s.brand} href={`#${SECTION_IDS.hero}`}>{profile.identity.name}</a>
          <nav className={s.nav} aria-label="Sections">
            <ul>
              {nav.map((n) => <li key={n.id}><a href={`#${n.id}`}>{n.label}</a></li>)}
            </ul>
          </nav>
          <div className={s.actions}>
            <div className={authStyles.themeControl}><ThemeToggle /></div>
            <Button onClick={onLogin}>Log in</Button>
          </div>
        </div>
        <div className={s.progress} aria-hidden="true"><span /></div>
      </header>
      <main id="portfolio-main" tabIndex={-1}>
        <Hero profile={profile} />
        <About profile={profile} />
        <Skills profile={profile} />
        <ExperienceSection profile={profile} />
        <Projects profile={profile} />
        <Recognition profile={profile} />
        <Education profile={profile} />
        <Contact profile={profile} />
      </main>
      <footer className={s.footer}>
        <p>© {new Date().getFullYear()} {profile.identity.name}</p>
      </footer>
    </div>
  );
}

export default Portfolio;


