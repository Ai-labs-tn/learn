import { useId, useState } from 'react';
import { projectStory, SECTION_IDS } from '../derive';
import { useReducedMotion, useTilt } from '../hooks/motion';
import type { Profile, Project } from '../types';
import { Reveal, SectionShell } from './shared';
import s from '../portfolio.module.css';

function ProjectCard({ project, story, index }: { project: Project; story: string; index: number }) {
  const reduced = useReducedMotion();
  const ref = useTilt<HTMLElement>(reduced, 8);
  const [open, setOpen] = useState(false);
  const panel = useId();
  const hasMore = project.techStack.length > 0 || project.roles.length > 0;
  return (
    <Reveal as="li" i={index % 3} className={s.cardCell}>
      <article ref={ref} className={s.card} aria-labelledby={`${panel}-t`}>
        <span className={s.specular} aria-hidden="true" />
        {project.domain && <span className={s.chipStrong}>{project.domain}</span>}
        <h3 id={`${panel}-t`} className={s.h3}>{project.name}</h3>
        <p className={s.body}>{story}</p>
        {hasMore && (
          <>
            <button type="button" className={s.linkBtn} aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide details' : 'Details'}
            </button>
            {open && (
              <div id={panel} className={s.details}>
                {project.techStack.length > 0 && (
                  <ul className={s.chips} aria-label="Tech stack">{project.techStack.map((t) => <li key={t} className={s.chip}>{t}</li>)}</ul>
                )}
                {project.roles.length > 0 && (
                  <ul className={s.roles}>
                    {project.roles.map((r) => <li key={r.title}><strong>{r.title}</strong>{r.description ? ` — ${r.description}` : ''}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </article>
    </Reveal>
  );
}

export function Projects({ profile }: { profile: Profile }) {
  const [filter, setFilter] = useState('All');
  if (!profile.projects.length) return null;
  const domains = [...new Set(profile.projects.map((p) => p.domain).filter(Boolean))];
  const shown = filter === 'All' ? profile.projects : profile.projects.filter((p) => p.domain === filter);
  return (
    <SectionShell id={SECTION_IDS.projects} eyebrow="Projects" title="Selected work">
      {domains.length > 1 && (
        <div className={s.filters} role="group" aria-label="Filter projects by domain">
          {['All', ...domains].map((d) => (
            <button key={d} type="button" className={s.filter} aria-pressed={filter === d} onClick={() => setFilter(d)}>{d}</button>
          ))}
        </div>
      )}
      <ul className={s.cardGrid} key={filter}>
        {shown.map((p, i) => <ProjectCard key={p.id} project={p} story={projectStory(profile, p.id, p.summary)} index={i} />)}
      </ul>
    </SectionShell>
  );
}
