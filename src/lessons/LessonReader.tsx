import { Button } from '@agiler/ui';
import { useEffect, useState } from 'react';
import { ApiError, request } from '../auth/api';
import { readPublished, type Language, type LessonBeat, type PublishedLesson } from './types';
import styles from './lessons.module.css';

const labels = { power: 'Power supply', firmware: 'Firmware', cpu: 'CPU', ram: 'RAM', storage: 'Storage', overview: 'Machine overview' };

export function BeatVisual({ beat }: { beat: LessonBeat }) {
  return (
    <section className={styles.visual} aria-label="Conceptual machine overview">
      <p className={styles.eyebrow}>Conceptual illustration · not a hardware diagnostic</p>
      <div className={styles.parts}>
        {(['power', 'firmware', 'cpu', 'ram', 'storage'] as const).map((part) => (
          <div key={part} className={`${styles.part} ${beat.visual.focus === part ? styles.focus : ''}`}>
            <strong>{labels[part]}</strong>
            <span>{beat.visual.focus === part ? beat.visual.status ?? 'In focus' : 'Component'}</span>
          </div>
        ))}
      </div>
      <p className={styles.focusNote}>
        {beat.visual.action === 'signal' && beat.visual.from && beat.visual.to
          ? `${labels[beat.visual.from]} → ${labels[beat.visual.to]}`
          : `${labels[beat.visual.focus]}${beat.visual.status ? ` · ${beat.visual.status}` : ''}`}
      </p>
    </section>
  );
}

/** Pins the publication loaded for this visit; later publishing never hot-swaps a running lesson. */
export function LessonReader({ publication }: { publication: PublishedLesson }) {
  const [index, setIndex] = useState(0);
  const [language, setLanguage] = useState<Language>('en');
  const beats = publication.document.scenes.flatMap((scene) => scene.beats.map((beat) => ({ ...beat, sceneTitle: scene.title })));
  const beat = beats[index];
  return (
    <article className={styles.reader}>
      <header className={styles.readerHeader}>
        <div><p className={styles.eyebrow}>Published revision {publication.revision}</p><h2>{publication.document.title}</h2></div>
        <Button variant="outline" onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')}>{language === 'en' ? 'தமிழ் captions' : 'English captions'}</Button>
      </header>
      <p>{publication.document.description}</p>
      <h3>{beat.sceneTitle}</h3>
      <BeatVisual beat={beat} />
      <p className={styles.caption} lang={language === 'ta' ? 'ta' : 'en'}>{beat.captions?.[language] ?? beat.narration[language]}</p>
      <nav className={styles.controls} aria-label="Published lesson controls">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous beat</Button>
        <span role="status">Beat {index + 1} of {beats.length}</span>
        <Button disabled={index === beats.length - 1} onClick={() => setIndex(index + 1)}>Next beat</Button>
        <Button variant="ghost" onClick={() => setIndex(0)}>Restart story</Button>
      </nav>
    </article>
  );
}

export function PublishedLessons() {
  const [publication, setPublication] = useState<PublishedLesson | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'expired'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    const load = async () => {
      try {
        const response = await request('/api/lessons', { signal: controller.signal });
        const lessons: unknown = await response.json();
        if (!Array.isArray(lessons)) throw new Error('Invalid lesson index.');
        if (!lessons.length) { if (!controller.signal.aborted) setStatus('empty'); return; }
        const first = lessons[0] as { id?: unknown };
        if (typeof first.id !== 'string') throw new Error('Invalid lesson index.');
        const lesson = await request(`/api/lessons/${encodeURIComponent(first.id)}`, { signal: controller.signal });
        const parsed = readPublished(await lesson.json());
        if (!controller.signal.aborted) { setPublication(parsed); setStatus('ready'); }
      } catch (error) {
        if (!controller.signal.aborted) setStatus(error instanceof ApiError && error.status === 401 ? 'expired' : 'error');
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className={styles.library} aria-labelledby="library-title">
      <header><p className={styles.eyebrow}>Learn at your own pace</p><h1 id="library-title">Lesson library</h1></header>
      {status === 'loading' && <p role="status">Loading published lessons…</p>}
      {status === 'empty' && <p>No lessons have been published yet.</p>}
      {status === 'expired' && <p role="alert">Your session has expired. Reload to sign in again.</p>}
      {status === 'error' && <div><p role="alert">Published lessons could not be loaded. Your existing learning tracks are still available.</p><Button variant="outline" onClick={() => setAttempt(attempt + 1)}>Retry lessons</Button></div>}
      {status === 'ready' && publication && <LessonReader key={`${publication.document.id}-${publication.revision}`} publication={publication} />}
    </section>
  );
}
