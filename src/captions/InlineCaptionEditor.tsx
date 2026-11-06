import { Button } from '@agiler/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../auth/api';
import type { Language, LessonDocument } from '../lessons/types';
import { useCaptionAccess } from './CaptionAccess';
import { BASELINE, captionText, changedCaptions, readCaptionDocument, replaceCaption } from './model';
import styles from './captions.module.css';

type Draft = { document: LessonDocument; version: number; etag: string };
type Suggestion = { text: string; model: string; mode: 'improve' | 'review' };
async function readDraft(response: Response, baseline: LessonDocument): Promise<Draft> {
  const value = await response.json();
  const etag = response.headers.get('ETag');
  if (!Number.isInteger(value.version) || value.version < 1 || etag !== `"${value.version}"`) throw new Error('Invalid draft version. Reload before saving.');
  return { document: readCaptionDocument(value.document, baseline), version: value.version, etag };
}

export function InlineCaptionEditor({ stepId, phase, language, onEditing, baseline = BASELINE }: {
  stepId: string; phase: string; language: Language; onEditing: (open: boolean) => void; baseline?: LessonDocument;
}) {
  const draftPath = `/api/studio/lessons/${encodeURIComponent(baseline.id)}/draft`;
  const publishedPath = `/api/lessons/${encodeURIComponent(baseline.id)}`;
  const access = useCaptionAccess();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publication, setPublication] = useState<LessonDocument>(baseline);
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [denied, setDenied] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiMessage, setAiMessage] = useState('AI availability has not been checked.');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [reviewPublish, setReviewPublish] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const dirty = loaded && text !== savedText;
  const unsaved = useRef(false);
  unsaved.current = dirty || busy;
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (open && loaded) textarea.current?.focus();
  }, [open, loaded]);
  useEffect(() => {
    const previous = window.location.href;
    let approvedDestination = '';
    const beforeUnload = (event: BeforeUnloadEvent) => { if (unsaved.current) { event.preventDefault(); event.returnValue = ''; } };
    const click = (event: MouseEvent) => {
      if (!unsaved.current || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      const signOut = event.target.closest('button')?.textContent?.trim() === 'Sign out';
      // New-tab reference reading does not discard this editor. External navigation uses beforeunload.
      if (!signOut && (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey)) return;
      if (anchor && new URL(anchor.href).origin + new URL(anchor.href).pathname !== window.location.origin + window.location.pathname) return;
      if (!window.confirm('Leave this caption? Unsaved text or an in-flight request may be lost.')) {
        event.preventDefault(); event.stopPropagation();
      } else if (anchor) approvedDestination = anchor.href;
    };
    const hash = (event: HashChangeEvent) => {
      if (event.newURL === approvedDestination) { approvedDestination = ''; return; }
      if (unsaved.current && !window.confirm('Leave this caption? Unsaved text or an in-flight request may be lost.')) {
        window.history.replaceState(null, '', previous); event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    window.addEventListener('hashchange', hash, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('hashchange', hash, true);
    };
  }, []);

  if (!access) return null;
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': access.csrfToken };
  const failure = (cause: unknown) => {
    if (cause instanceof ApiError) {
      if (cause.status === 401) { access.onSessionExpired(); return; }
      if (cause.status === 403) { setDenied(true); setError('Administrator or CSRF verification was denied. Your text is retained; reload after signing in.'); return; }
      if (cause.status === 409) { setConflict(true); setError('Version conflict: another tab changed this draft. Your text is retained. Copy it before loading the latest draft.'); return; }
      if (cause.status === 429) { setError('AI request limit reached. No suggestion was applied. Try again later.'); return; }
      if (cause.status === 503) { setError('Service unavailable (503). The server may be waking up, or AI assistance is not configured. Your text is retained; retry when ready.'); return; }
      if (cause.status === 502) { setError('AI provider failed or returned rejected output. Your text is retained.'); return; }
    }
    setError(cause instanceof Error ? cause.message : 'Request failed. Your text is retained.');
  };
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const current = new AbortController(); controller.current = current;
    try { await action(current.signal); }
    catch (cause) { if (alive.current && !current.signal.aborted) failure(cause); }
    finally { if (alive.current) { setBusy(false); lock.current = false; } }
  };
  const checkAi = async (signal: AbortSignal) => {
    try {
      const value = await (await request('/api/studio/ai/status', { signal })).json();
      if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.remainingToday)) throw new Error('Invalid AI status.');
      if (!signal.aborted) {
        setAiEnabled(value.enabled && value.remainingToday > 0);
        setAiMessage(!value.enabled ? 'AI assistance is not configured on this server.' : `AI requests remaining today: ${value.remainingToday}.`);
      }
    } catch (cause) {
      if (!signal.aborted) { setAiEnabled(false); setAiMessage('AI availability could not be verified.'); if (cause instanceof ApiError && [401, 403].includes(cause.status)) throw cause; }
    }
  };
  const load = () => {
    if (dirty && !window.confirm('Discard unsaved caption text and load the latest draft?')) return;
    setOpen(true); onEditing(true); setLoaded(false); setSuggestion(null); setReviewPublish(false);
    void run(async signal => {
      let next: Draft | null = null;
      try { next = await readDraft(await request(draftPath, { signal }), baseline); }
      catch (cause) { if (!(cause instanceof ApiError && cause.status === 404)) throw cause; }
      let published = baseline;
      try { const body = await (await request(publishedPath, { signal })).json(); published = readCaptionDocument(body.document, baseline); }
      catch (cause) { if (!(cause instanceof ApiError && cause.status === 404)) throw cause; }
      if (signal.aborted) return;
      const value = captionText(next?.document ?? baseline, stepId, language);
      setDraft(next); setPublication(published); setText(value); setSavedText(value); setLoaded(true); setConflict(false); setDenied(false);
      setMessage(next ? `Saved draft v${next.version} loaded. This is not necessarily the published caption.` : `No draft yet. Saving creates a separate ${baseline.scenes[0].beats.length}-step caption draft for this chapter; other lessons are not changed.`);
      await checkAi(signal);
    });
  };
  const save = () => void run(async signal => {
    const document = replaceCaption(draft?.document ?? baseline, stepId, language, text, baseline);
    const result = await readDraft(await request(draft ? draftPath : '/api/studio/lessons', {
      method: draft ? 'PUT' : 'POST', headers: { ...headers, ...(draft ? { 'If-Match': draft.etag } : {}) }, body: JSON.stringify(document), signal,
    }), baseline);
    if (signal.aborted) return;
    setDraft(result); setSavedText(text); setSuggestion(null); setReviewPublish(false);
    setMessage('Draft saved. Learners still see the published caption. Publishing requires a separate review and confirmation.');
  });
  const assist = (mode: 'improve' | 'review') => void run(async signal => {
    replaceCaption(draft?.document ?? baseline, stepId, language, text, baseline); // validate locally, also on the server
    setSuggestion(null);
    const value = await (await request('/api/studio/ai/assist', {
      method: 'POST', signal, timeoutMs: 65_000, headers,
      body: JSON.stringify({ mode, language, text, lessonTitle: baseline.title, sceneContext: {
        title: `${phase}: ${stepId}`, beats: [{ id: stepId, narrationEn: captionText(draft?.document ?? baseline, stepId, 'en') }],
        summary: 'Conceptual PC boot illustration, not literal electrical timing. Firmware is software in non-volatile storage; POST checks vary by platform; BIOS legacy boot and UEFI boot differ. CPU cores and hardware threads are not interchangeable. Reference notes: UEFI Specification, boot manager and platform initialization; Intel Software Developer Manuals, processor initialization. These are bundled notes, not live source retrieval. Flag uncertainty and OS or hardware-specific assumptions. Never invent citations or claim verification.',
      }, maxBeats: 1 }),
    })).json();
    if (signal.aborted) return;
    if (typeof value.suggestion !== 'string' || typeof value.model !== 'string' || !value.suggestion.trim()) throw new Error('Invalid AI response; nothing was applied.');
    if (mode === 'improve') replaceCaption(draft?.document ?? baseline, stepId, language, value.suggestion, baseline);
    setSuggestion({ mode, text: value.suggestion, model: value.model });
    await checkAi(signal);
  });
  const changes = draft ? changedCaptions(publication, draft.document) : [];
  const publish = () => void run(async signal => {
    if (!draft || dirty || !reviewPublish) return;
    const response = await request(`/api/studio/lessons/${encodeURIComponent(baseline.id)}/publish`, {
      method: 'POST', signal, headers: { ...headers, 'If-Match': draft.etag },
    });
    const next = await readDraft(response, baseline);
    if (signal.aborted) return;
    setDraft(next); setPublication(next.document); setReviewPublish(false);
    setMessage('Published successfully. Reload the boot scene to load this revision. Active playback remains pinned to its loaded captions.');
  });
  const close = () => {
    if (unsaved.current && !window.confirm('Discard unsaved text? Saved drafts remain on the server.')) return;
    setOpen(false); setSuggestion(null); setReviewPublish(false); onEditing(false);
  };
  return (
    <section className={styles.tools} aria-label="Caption authoring">
      {!open ? <div className={styles.toolbar}>
        <Button variant="outline" onClick={load}>✎ Edit caption</Button>
        <Button variant="outline" title="Open the caption editor to review text before requesting an AI rewrite" onClick={load}>✨ AI Rewrite</Button>
        <Button variant="outline" title="Open the caption editor to review context before requesting an AI fact-check" onClick={load}>✓ AI Fact-check</Button>
      </div> : <>
        <h3>Edit caption and narration — {phase} / {stepId} ({language === 'en' ? 'English' : 'Tamil'})</h3>
        <p>Playback is paused. Changes apply only to this step and language. The other language is not automatically translated.</p>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {!loaded && !busy && <Button onClick={load}>Retry caption load</Button>}
        {loaded && <>
          <label className={styles.label}>Caption and narration<textarea ref={textarea} rows={5} maxLength={2000} value={text} disabled={busy} onChange={event => { setText(event.target.value); setSuggestion(null); setReviewPublish(false); }} /></label>
          <p>{dirty ? 'Unsaved changes' : 'No unsaved text changes'} · {Array.from(text).length}/2000 characters</p>
          <p>{aiMessage}</p>
          <p>AI advice is not guaranteed factual verification. No live sources are retrieved. Only this caption and scene context are sent to the configured provider.</p>
          <p>Reference reading: <a href="https://uefi.org/specs/UEFI/2.10/" target="_blank" rel="noopener noreferrer">UEFI Specification</a> · <a href="https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html" target="_blank" rel="noopener noreferrer">Intel processor manuals</a></p>
          <div className={styles.toolbar}>
            <Button variant="outline" disabled={busy || denied || !aiEnabled} onClick={() => assist('improve')}>✨ AI Rewrite</Button>
            <Button variant="outline" disabled={busy || denied || !aiEnabled} onClick={() => assist('review')}>✓ AI Fact-check</Button>
            <Button variant="outline" disabled={busy || denied} onClick={() => void run(checkAi)}>Refresh AI availability</Button>
          </div>
          {suggestion && <div className={styles.suggestion}>
            <h4>{suggestion.mode === 'improve' ? 'Compare rewrite with your current text' : 'AI technical review — advisory only'}</h4>
            <p>Model: {suggestion.model}</p>
            <h5>Current text</h5><p className={styles.prose}>{text}</p>
            <h5>{suggestion.mode === 'improve' ? 'Suggested rewrite' : 'Review findings'}</h5><p className={styles.prose}>{suggestion.text}</p>
            {suggestion.mode === 'improve' && <Button onClick={() => { setText(suggestion.text); setSuggestion(null); }}>Accept rewrite into editor</Button>}
            <Button variant="outline" onClick={() => setSuggestion(null)}>Discard AI suggestion</Button>
          </div>}
          <div className={styles.toolbar}>
            <Button disabled={busy || conflict || denied || !text.trim() || (!dirty && !!draft)} onClick={save}>Save caption draft</Button>
            <Button variant="outline" disabled={busy} onClick={load}>Load latest draft</Button>
            <Button variant="outline" disabled={busy || dirty || conflict || denied || !draft || changes.length === 0} onClick={() => setReviewPublish(true)}>Review publication</Button>
          </div>
          {reviewPublish && <div className={styles.suggestion}>
            <h4>Publish all saved caption changes in this boot lesson?</h4>
            <p>This publishes the entire saved caption draft for this chapter, including changes from other editing sessions. Review every difference below.</p>
            {changes.map(change => <div key={`${change.step}-${change.language}`}><h5>{change.step} ({change.language})</h5><p>Published/baseline: {change.before}</p><p>Saved draft: {change.after}</p></div>)}
            <Button disabled={busy || conflict || dirty || denied} onClick={publish}>Confirm publish captions</Button>
            <Button variant="outline" disabled={busy} onClick={() => setReviewPublish(false)}>Cancel publication</Button>
          </div>}
        </>}
        {busy ? <><p role="status">Working…</p><Button variant="outline" onClick={() => { controller.current?.abort(); setMessage('Request cancelled locally. A write may already have reached the server; load the latest draft before retrying.'); setConflict(true); }}>Cancel request</Button></> : <Button variant="outline" onClick={close}>Close caption editor</Button>}
      </>}
    </section>
  );
}
