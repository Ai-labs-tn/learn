import type { ReactNode } from 'react';
import { chapterPath, type Chapter, type Skill } from './catalog';
import styles from './learning.module.css';

/** Subject context around the existing demos; unbuilt topics are explicitly a roadmap. */
export function SkillTrack({ skill, chapter, children }: { skill: Skill; chapter?: Chapter; children?: ReactNode }) {
  // The theatre player owns its entire stage; unrelated subject introductions/roadmaps stay outside playback.
  if (chapter && ['inside-machine', 'desktop-startup', 'chrome-launch', 'java-machine', 'jvm-runtime', 'bytecode-stepper', 'dsa'].includes(chapter.id)) return <div className={styles.track}>{children}</div>;
  return (
    <div className={styles.track}>
      <section className={styles.introduction} aria-labelledby="skill-heading">
        <p className={styles.eyebrow}>My engineering learning journey</p>
        <h2 id="skill-heading" tabIndex={-1}>{skill.title}</h2>
        <p>{skill.introduction}</p>
        {skill.chapters.length > 0 ? (
          <nav aria-label={`${skill.title} chapters`}>
            <ul className={styles.chapters}>
              {skill.chapters.map((item) => (
                <li key={item.id}>
                  <a href={`#${chapterPath(skill.id, item.id)}`} aria-current={chapter?.id === item.id ? 'page' : undefined}>
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className={styles.planned}>Planned learning track — interactive scenes and exercises are not available yet.</p>
        )}
        {chapter && <p className={styles.chapterDescription}>{chapter.description}</p>}
      </section>
      {children}
      {skill.plannedTopics.length > 0 && (
        <section className={styles.roadmap} aria-labelledby="roadmap-heading">
          <h3 id="roadmap-heading">Coming next in {skill.title}</h3>
          <p>Planned topics, not completed lessons. Each will follow: explain → explore → try it → results → AI review.</p>
          <ul>{skill.plannedTopics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
          <p>Real execution results and AI suggestions will be labelled separately. AI review is not proof of correctness.</p>
        </section>
      )}
    </div>
  );
}
