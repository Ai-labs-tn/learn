import { Button } from '@agiler/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, readSession, request } from '../auth/api';
import { LessonReader } from './LessonReader';
import { readDocument, signalPairs, visualTargets, type Language, type LessonBeat, type LessonDocument, type VisualTarget } from './types';
import styles from './studio.module.css';

type AiMode = 'improve' | 'review' | 'translate' | 'shorten' | 'visual-suggestions' | 'storyboard' | 'checkpoint';
type AiStatus = { enabled: boolean; models: string[]; remainingToday: number };
type AiSuggestion = { mode: AiMode; target: Language | null; text: string; model: string; requestId: string };
type Draft = { document: LessonDocument; version: number; baseRevision: number | null };
type Entry = { id: string; title: string; description: string; version: number; baseRevision: number | null; publishedRevision: number | null; updatedAt: string };
type Revision = { revision: number; title: string; publishedAt: string };
const root = '/api/studio/lessons';
const path = (id: string, action: string) => `${root}/${encodeURIComponent(id)}/${action}`;
function uniqueId(document: LessonDocument, prefix: string) {
  const used = new Set([document.id, ...document.scenes.flatMap((scene) => [scene.id, ...scene.beats.map((beat) => beat.id)])]);
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function newBeat(id: string): LessonBeat {
  return { id, narration: { en: 'Describe this step.', ta: 'இந்தப் படியை விளக்குங்கள்.' }, visual: { component: 'boot-machine', focus: 'overview', action: 'focus' } };
}
function defaultDocument(id: string): LessonDocument {
  const document: LessonDocument = { schemaVersion: 1, id, title: 'New lesson', description: 'Describe this lesson.', scenes: [] };
  const sceneId = uniqueId(document, 'scene');
  document.scenes.push({ id: sceneId, title: 'First scene', beats: [] });
  document.scenes[0].beats.push(newBeat(uniqueId(document, 'beat')));
  return document;
}
async function readDraft(response: Response): Promise<{ draft: Draft; etag: string }> {
  const value = await response.json();
  const etag = response.headers.get('ETag');
  if (!Number.isInteger(value?.version) || value.version < 1 || value.version > 2147483646 ||
      !etag || etag !== `"${value.version}"` ||
      !(value.baseRevision === null || (Number.isInteger(value.baseRevision) && value.baseRevision > 0))) throw new Error('Invalid draft version or strong quoted ETag. Reload before editing.');
  return { draft: { document: readDocument(value.document), version: value.version, baseRevision: value.baseRevision }, etag };
}
function move<T>(items: T[], index: number, offset: number): T[] {
  const copy = [...items];
  [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]];
  return copy;
}

export function LessonStudio({ onSessionExpired, accessVerified = true }: { onSessionExpired: () => void; accessVerified?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [document, setDocument] = useState<LessonDocument | null>(null);
  const [etag, setEtag] = useState('');
  const [saved, setSaved] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [beatId, setBeatId] = useState('');
  const [history, setHistory] = useState<Revision[]>([]);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState('Loading lesson drafts…');
  const [error, setError] = useState('');
  const [newId, setNewId] = useState('');
  const [preview, setPreview] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const token = useRef('');
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiLock = useRef(false);
  const dirty = !!document && JSON.stringify(document) !== saved;
  const disabled = busy || conflict || denied || !accessVerified;
  const assistDisabled = aiBusy || !aiStatus?.enabled;
  const scene = document?.scenes.find((item) => item.id === sceneId);
  const beat = scene?.beats.find((item) => item.id === beatId);
  const sceneIndex = document?.scenes.findIndex((item) => item.id === sceneId) ?? 0;
  const beatIndex = scene?.beats.findIndex((item) => item.id === beatId) ?? 0;
  const totalBeats = document?.scenes.reduce((sum, item) => sum + item.beats.length, 0) ?? 0;

  const accept = ({ draft: next, etag: tag }: { draft: Draft; etag: string }) => {
    setDraft(next); setDocument(next.document); setSaved(JSON.stringify(next.document)); setEtag(tag);
    setSceneId(next.document.scenes[0].id); setBeatId(next.document.scenes[0].beats[0].id);
    setConflict(false); setPreview(false);
  };
  const loadIndex = async (signal: AbortSignal) => {
    const response = await request(root, { signal });
    const value = await response.json();
    if (!Array.isArray(value) || value.some((item) => typeof item?.id !== 'string' || typeof item?.title !== 'string')) throw new Error('Invalid draft index.');
    if (!signal.aborted) setEntries(value);
    return value as Entry[];
  };
  const loadHistory = async (id: string, signal: AbortSignal) => {
    const response = await request(path(id, 'history'), { signal });
    const value = await response.json();
    if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item?.revision) || item.revision < 1 || typeof item.title !== 'string' || typeof item.publishedAt !== 'string')) throw new Error('Invalid revision history.');
    if (!signal.aborted) setHistory(value);
  };
  const load = async (id: string, signal: AbortSignal) => {
    const response = await request(path(id, 'draft'), { signal });
    const next = await readDraft(response);
    if (next.draft.document.id !== id) throw new Error('Draft ID does not match the selected lesson.');
    if (signal.aborted) return;
    accept(next); setHistory([]);
    setMessage('Draft loaded.');
    await loadHistory(id, signal);
  };
  const readAiStatus = async (signal: AbortSignal) => {
    const response = await request('/api/studio/ai/status', { signal });
    const value = await response.json();
    if (signal.aborted) return;
    if (typeof value?.enabled !== 'boolean' || !Array.isArray(value?.models) || value.models.some((item: unknown) => typeof item !== 'string') || !Number.isInteger(value?.remainingToday) || value.remainingToday < 0) throw new Error('AI assist status returned an unexpected response.');
    setAiStatus({ enabled: value.enabled, models: value.models, remainingToday: value.remainingToday });
  };
  const aiFailureMessage = (status: number, detail: string, remaining: number | null) => {
    const extra = detail ? ` ${detail}` : '';
    if (status === 503) return `AI assistance is disabled on this server (503): no provider key is configured. Nothing was sent to a provider.${extra}`;
    if (status === 429) return `Daily AI request budget exhausted (429). The request did not reach the provider.${remaining !== null ? ` Requests remaining today: ${remaining}.` : ''} The budget resets at the next UTC day.${extra}`;
    if (status === 502) return `AI provider failure (502). The provider answer was rejected, not truncated and nothing was applied.${extra}`;
    if (status === 422) return `AI request rejected by validation (422). Check that the narration is non-empty plain text within the length limits.${extra}`;
    if (status === 401) return `Your session expired (401). Sign in again to use AI assistance.${extra}`;
    if (status === 403) return `Administrator access or CSRF verification was denied for AI assistance (403). Reload to verify access.${extra}`;
    return `AI assistance request failed (${status}). Nothing was retried automatically.${extra}`;
  };
  const refreshAiStatus = () => { void readAiStatus(new AbortController().signal).catch(() => setAiError('AI assist status could not be refreshed. Reload to see the remaining request budget.')); };
  const runAssist = async (mode: AiMode, target: Language | null, body: Record<string, unknown>) => {
    if (aiLock.current || !token.current) return; // One in-flight request guard: parallel clicks are ignored.
    aiLock.current = true;
    setAiBusy(true); setAiError(''); setAiSuggestion(null);
    try {
      const response = await fetch('/api/studio/ai/assist', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.current },
        body: JSON.stringify(body),
      });
      const value: unknown = await response.json().catch(() => null);
      const detail = typeof (value as { detail?: unknown } | null)?.detail === 'string' ? (value as { detail: string }).detail : '';
      if (!response.ok) {
        setAiError(aiFailureMessage(response.status, detail, aiStatus?.remainingToday ?? null));
        if (response.status === 429 || response.status === 401 || response.status === 403) refreshAiStatus();
        return;
      }
      if (typeof (value as { suggestion?: unknown })?.suggestion !== 'string' || typeof (value as { model?: unknown })?.model !== 'string' || typeof (value as { requestId?: unknown })?.requestId !== 'string') {
        setAiError('AI assist returned an unexpected response. No suggestion was shown or applied.');
        return;
      }
      const result = value as { suggestion: string; model: string; requestId: string };
      setAiSuggestion({ mode, target, text: result.suggestion, model: result.model, requestId: result.requestId });
      refreshAiStatus();
    } catch (cause) {
      setAiError(cause instanceof Error && !(cause instanceof TypeError) ? `AI assistance request failed locally: ${cause.message}` : 'Network error contacting AI assistance. Nothing was retried automatically.');
    } finally {
      aiLock.current = false;
      setAiBusy(false);
    }
  };
  const beatAssist = (mode: AiMode) => {
    if (!beat) return;
    const target: Language | null = mode === 'translate' ? 'ta' : mode === 'improve' || mode === 'shorten' ? 'en' : null;
    void runAssist(mode, target, { mode, language: mode === 'translate' ? 'ta' : 'en', text: beat.narration.en });
  };
  const sceneAssist = (mode: AiMode) => {
    if (!document || !scene) return;
    void runAssist(mode, null, { mode, language: 'en', sceneContext: { title: scene.title, beats: scene.beats.slice(0, 8).map((item) => ({ id: item.id, narrationEn: item.narration.en })) }, lessonTitle: document.title, maxBeats: 8 });
  };
  const applySuggestion = () => {
    if (!aiSuggestion || aiSuggestion.target === null || !beat) return;
    editBeat({ ...beat, narration: { ...beat.narration, [aiSuggestion.target]: aiSuggestion.text } }); // Local draft only; never auto-saved or published.
    setAiSuggestion(null);
  };
  const copySuggestion = async () => {
    if (!aiSuggestion) return;
    try { await navigator.clipboard.writeText(aiSuggestion.text); }
    catch { setAiError('Clipboard copy failed. Select the suggestion text and copy it manually.'); }
  };
  const run = async (label: string, action: (signal: AbortSignal) => Promise<void>, versioned = false) => {
    if (lock.current) return;
    lock.current = true;
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError(''); setMessage(label);
    try { await action(current.signal); }
    catch (cause) {
      if (current.signal.aborted) return;
      setMessage('');
      if (cause instanceof ApiError) {
        if (cause.status === 401) { setDenied(true); setError('Your session expired. Sign in again to use Studio.'); onSessionExpired(); }
        else if (cause.status === 403) { setDenied(true); setError('Administrator access or CSRF verification was denied. Reload to verify access; no further edits are allowed.'); }
        else if (cause.status === 409) {
          if (versioned) { setConflict(true); setError('Conflict: this draft changed in another session. Your local changes have not been overwritten. Reload the draft explicitly, then merge deliberately.'); }
          else setError('That lesson ID already exists. Choose a different unique ID.');
        } else if (cause.status === 422) setError('Validation failed (422). Check required English and Tamil text, plain-text limits and visual selections. Your local draft is retained.');
        else if (cause.status === 404) setError('This lesson or revision no longer exists. Reload the lesson index.');
        else if (cause.status === 428) { setConflict(true); setError('A draft version is required. Reload the draft before trying again.'); }
        else setError(`Studio request failed (${cause.status}). Nothing was retried automatically. Reload to verify the server state before repeating a write.`);
      } else setError(cause instanceof TypeError ? 'Network error. Your local draft is retained. A write may have reached the server; reload to verify its state before repeating it.' : cause instanceof Error ? cause.message : 'Studio could not complete the request. Your local draft is retained. Reload to verify the server state.');
    } finally {
      if (!current.signal.aborted) { lock.current = false; setBusy(false); }
    }
  };
  useEffect(() => {
    lock.current = false;
    void run('Loading lesson drafts…', async (signal) => {
      const session = await readSession('/api/auth/me', { signal });
      if (session.user.role !== 'admin') throw new ApiError(403);
      if (signal.aborted) return;
      token.current = session.csrfToken;
      try { await readAiStatus(signal); } catch (cause) { if (!signal.aborted) setAiError(cause instanceof Error ? `AI assist status unavailable: ${cause.message}` : 'AI assist status unavailable.'); }
      const list = await loadIndex(signal);
      if (signal.aborted) return;
      if (list.length) await load(list[0].id, signal);
      else setMessage('No drafts yet. Create an unpublished lesson to begin.');
    });
    return () => { controller.current?.abort(); lock.current = false; token.current = ''; };
    // Initialization is explicit; edits must never trigger an automatic reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const protectNavigation = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (link && !window.confirm('Leave Studio and discard unsaved changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    window.document.addEventListener('click', protectNavigation, true);
    return () => { window.removeEventListener('beforeunload', warn); window.document.removeEventListener('click', protectNavigation, true); };
  }, [dirty]);

  const discard = () => !dirty || window.confirm('Discard unsaved changes and load the selected draft?');
  const edit = (next: LessonDocument) => { if (disabled) return; setDocument(next); setMessage('Unsaved changes.'); setError(''); };
  const editScene = (next: LessonDocument['scenes'][number]) => {
    if (document) edit({ ...document, scenes: document.scenes.map((item) => item.id === sceneId ? next : item) });
  };
  const editBeat = (next: LessonBeat) => { if (scene) editScene({ ...scene, beats: scene.beats.map((item) => item.id === beatId ? next : item) }); };
  const write = async (action: 'draft' | 'publish' | 'restore', signal: AbortSignal, body?: unknown) => {
    if (!document || !etag || !token.current) throw new Error('Reload to verify the session and draft version.');
    const response = await request(path(document.id, action), {
      method: action === 'draft' ? 'PUT' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.current, 'If-Match': etag },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const next = await readDraft(response);
    if (next.draft.document.id !== document.id) throw new Error('Unexpected draft ID. Reload before editing.');
    if (signal.aborted) return;
    accept(next);
    setMessage(action === 'draft' ? 'Draft saved. Published content is unchanged.' : action === 'publish' ? 'Lesson published. Draft version updated.' : 'Revision restored to draft only. Published content is unchanged. Save further edits and publish explicitly when ready.');
    await loadIndex(signal); await loadHistory(document.id, signal);
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!document || disabled || !dirty) return;
    try { readDocument(document); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid lesson.'); return; }
    void run('Saving draft…', (signal) => write('draft', signal, document), true);
  };
  const create = () => {
    if (disabled || !discard()) return;
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(newId)) { setError('Enter a unique lesson ID: lowercase letters, digits and hyphens, starting with a letter (up to 64 characters).'); return; }
    void run('Creating unpublished lesson…', async (signal) => {
      const response = await request(root, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.current }, body: JSON.stringify(defaultDocument(newId)) });
      const next = await readDraft(response);
      if (signal.aborted) return;
      accept(next); setHistory([]); setNewId(''); setMessage('Unpublished lesson created. Learners cannot see it until you publish.');
      await loadIndex(signal);
    });
  };
  let previewError = '';
  if (preview && document) { try { readDocument(document); } catch (cause) { previewError = cause instanceof Error ? cause.message : 'Complete the draft before previewing.'; } }

  return (
    <section className={styles.studio} aria-label="Lesson editor" aria-busy={busy}>
      <div className={styles.actions}>
        <label>Lesson draft<select disabled={busy || denied || conflict} value={document?.id ?? ''} onChange={(event) => { const id = event.target.value; if (discard()) void run('Loading draft…', (signal) => load(id, signal)); }}>
          {!document && <option value="">Select a lesson</option>}
          {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} ({entry.id}){entry.publishedRevision === null ? ' · unpublished' : ''}</option>)}
        </select></label>
        <Button variant="outline" disabled={busy || denied} onClick={() => { if (!discard()) return; if (document) void run('Reloading draft…', async (signal) => { await loadIndex(signal); await load(document.id, signal); }); else setAttempt((value) => value + 1); }}>Reload draft and index</Button>
      </div>
      <p role="status" aria-live="polite">{message}{dirty && message !== 'Unsaved changes.' ? ' Unsaved changes.' : ''}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {conflict && <p>Saving, publishing, restoring and editing are disabled until you explicitly reload. Copy any local text you need before reloading.</p>}
      <section className={styles.aiPanel} aria-labelledby="ai-assist-title" aria-busy={aiBusy || undefined}>
        <h2 id="ai-assist-title">AI assist</h2>
        <p role="status" aria-live="polite">{aiStatus ? (aiStatus.enabled ? `AI assist: ${aiStatus.remainingToday} requests remaining today` : 'AI assist is disabled on this server; assistance is unavailable until the provider key is configured.') : 'AI assist status is loading…'}</p>
        {aiBusy && <p role="status">AI request in progress…</p>}
        {aiError && <p role="alert" className={styles.error}>{aiError}</p>}
      </section>
      <fieldset disabled={disabled || !token.current}>
        <legend>New unpublished lesson</legend>
        <label>New lesson ID<input value={newId} maxLength={64} pattern="[a-z][a-z0-9-]*" onChange={(event) => setNewId(event.target.value)} /></label>
        <Button variant="outline" disabled={!newId} onClick={create}>Create lesson</Button>
      </fieldset>
      {document && draft && <>
        <form onSubmit={save} className={styles.editor}>
          <p>Lesson ID: {document.id} · Draft version {draft.version} · {draft.baseRevision === null ? 'Never published' : `Publication base ${draft.baseRevision}`}</p>
          <fieldset disabled={disabled}>
            <legend>Lesson metadata</legend>
            <label>Lesson title<input required maxLength={160} value={document.title} onChange={(event) => edit({ ...document, title: event.target.value })} /></label>
            <label>Lesson description<textarea required maxLength={1000} value={document.description} onChange={(event) => edit({ ...document, description: event.target.value })} /></label>
          </fieldset>
          <fieldset disabled={disabled}>
            <legend>Scenes</legend>
            <label>Selected scene<select value={sceneId} onChange={(event) => { const selected = document.scenes.find((item) => item.id === event.target.value)!; setSceneId(selected.id); setBeatId(selected.beats[0].id); }}>{document.scenes.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title}</option>)}</select></label>
            <div className={styles.actions}>
              <Button variant="outline" disabled={document.scenes.length >= 12 || totalBeats >= 120} onClick={() => {
                const next = { ...document, scenes: [...document.scenes, { id: uniqueId(document, 'scene'), title: 'New scene', beats: [] as LessonBeat[] }] };
                const added = next.scenes[next.scenes.length - 1]; added.beats.push(newBeat(uniqueId(next, 'beat')));
                edit(next); setSceneId(added.id); setBeatId(added.beats[0].id);
              }}>Add scene</Button>
              <Button variant="outline" disabled={document.scenes.length <= 1} onClick={() => { if (!window.confirm('Remove this scene and all its beats from the draft?')) return; const scenes = document.scenes.filter((item) => item.id !== sceneId); edit({ ...document, scenes }); setSceneId(scenes[0].id); setBeatId(scenes[0].beats[0].id); }}>Remove scene</Button>
              <Button variant="outline" disabled={sceneIndex === 0} onClick={() => edit({ ...document, scenes: move(document.scenes, sceneIndex, -1) })}>Move scene up</Button>
              <Button variant="outline" disabled={sceneIndex === document.scenes.length - 1} onClick={() => edit({ ...document, scenes: move(document.scenes, sceneIndex, 1) })}>Move scene down</Button>
            </div>
            {scene && <><p>Scene ID: {scene.id}</p><label>Scene title<input required maxLength={160} value={scene.title} onChange={(event) => editScene({ ...scene, title: event.target.value })} /></label>
              <div className={styles.aiControls}>
                <Button variant="outline" disabled={assistDisabled} onClick={() => sceneAssist('visual-suggestions')}>AI: suggest visuals</Button>
                <Button variant="outline" disabled={assistDisabled} onClick={() => sceneAssist('storyboard')}>AI: storyboard next beats</Button>
                <Button variant="outline" disabled={assistDisabled} onClick={() => sceneAssist('checkpoint')}>AI: draft checkpoint</Button>
              </div></>}
          </fieldset>
          {scene && beat && <fieldset disabled={disabled}>
            <legend>Beats</legend>
            <label>Selected beat<select value={beatId} onChange={(event) => setBeatId(event.target.value)}>{scene.beats.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.id}</option>)}</select></label>
            <div className={styles.actions}>
              <Button variant="outline" disabled={scene.beats.length >= 24 || totalBeats >= 120} onClick={() => { const added = newBeat(uniqueId(document, 'beat')); editScene({ ...scene, beats: [...scene.beats, added] }); setBeatId(added.id); }}>Add beat</Button>
              <Button variant="outline" disabled={scene.beats.length <= 1} onClick={() => { if (!window.confirm('Remove this beat from the draft?')) return; const beats = scene.beats.filter((item) => item.id !== beatId); editScene({ ...scene, beats }); setBeatId(beats[0].id); }}>Remove beat</Button>
              <Button variant="outline" disabled={beatIndex === 0} onClick={() => editScene({ ...scene, beats: move(scene.beats, beatIndex, -1) })}>Move beat up</Button>
              <Button variant="outline" disabled={beatIndex === scene.beats.length - 1} onClick={() => editScene({ ...scene, beats: move(scene.beats, beatIndex, 1) })}>Move beat down</Button>
            </div>
            <p>Beat ID: {beat.id}. Plain text only; both narration languages are required. Blank caption overrides use narration.</p>
            <div className={styles.aiControls}>
              <Button variant="outline" disabled={assistDisabled || !beat.narration.en.trim()} onClick={() => beatAssist('improve')}>AI: improve English narration</Button>
              <Button variant="outline" disabled={assistDisabled || !beat.narration.en.trim()} onClick={() => beatAssist('review')}>AI: review English narration</Button>
              <Button variant="outline" disabled={assistDisabled || !beat.narration.en.trim()} onClick={() => beatAssist('translate')}>AI: translate to Tamil</Button>
              <Button variant="outline" disabled={assistDisabled || !beat.narration.en.trim()} onClick={() => beatAssist('shorten')}>AI: shorten English narration</Button>
            </div>
            <div className={styles.narrationGrid}>
              {(['en', 'ta'] as Language[]).map((language) => <label key={`narration-${language}`}>{language === 'en' ? 'English narration' : 'Tamil narration'}<textarea required maxLength={2000} lang={language} value={beat.narration[language]} onChange={(event) => editBeat({ ...beat, narration: { ...beat.narration, [language]: event.target.value } })} /></label>)}
              {aiSuggestion && <section role="region" aria-label="AI suggestion (plain text, not saved)" className={styles.aiSuggestion}>
                <p className={styles.aiMeta}>Suggestion only — nothing is saved or published until you act. Model: {aiSuggestion.model} · Request ID: {aiSuggestion.requestId}</p>
                <p className={styles.aiText}>{aiSuggestion.text}</p>
                <div className={styles.actions}>
                  {aiSuggestion.target !== null && <Button onClick={applySuggestion}>Apply suggestion</Button>}
                  {aiSuggestion.target === null && <Button variant="outline" onClick={() => void copySuggestion()}>Copy to clipboard</Button>}
                  <Button variant="outline" onClick={() => setAiSuggestion(null)}>Discard suggestion</Button>
                </div>
              </section>}
            </div>
            {(['en', 'ta'] as Language[]).map((language) => <label key={`caption-${language}`}>{language === 'en' ? 'English caption override' : 'Tamil caption override'}<textarea maxLength={2000} lang={language} value={beat.captions?.[language] ?? ''} onChange={(event) => {
              const captions = { ...beat.captions }; if (event.target.value) captions[language] = event.target.value; else delete captions[language];
              const next = { ...beat }; if (Object.keys(captions).length) next.captions = captions; else delete next.captions; editBeat(next);
            }} /></label>)}
            <label>Visual action<select value={beat.visual.action} onChange={(event) => {
              const action = event.target.value as LessonBeat['visual']['action'];
              const focus = beat.visual.focus;
              editBeat({ ...beat, visual: action === 'signal' ? { component: 'boot-machine', action, focus: 'power', from: 'power', to: 'firmware' } : action === 'status' ? { component: 'boot-machine', action, focus: focus === 'overview' ? 'cpu' : focus, status: 'idle' } : { component: 'boot-machine', action, focus } });
            }}>{['focus', 'signal', 'status'].map((action) => <option key={action}>{action}</option>)}</select></label>
            {beat.visual.action === 'signal' && <label>Signal path<select value={`${beat.visual.from}:${beat.visual.to}`} onChange={(event) => {
              const [from, to] = signalPairs.find(([from, to]) => `${from}:${to}` === event.target.value)!;
              editBeat({ ...beat, visual: { component: 'boot-machine', action: 'signal', from, to, focus: from } });
            }}>{signalPairs.map(([from, to]) => <option key={`${from}:${to}`} value={`${from}:${to}`}>{from} → {to}</option>)}</select></label>}
            <label>Visual focus<select value={beat.visual.focus} onChange={(event) => editBeat({ ...beat, visual: { ...beat.visual, focus: event.target.value as VisualTarget } })}>
              {visualTargets.filter((target) => beat.visual.action === 'signal' ? target === beat.visual.from || target === beat.visual.to : beat.visual.action !== 'status' || target !== 'overview').map((target) => <option key={target}>{target}</option>)}
            </select></label>
            {beat.visual.action === 'status' && <label>Visual status<select value={beat.visual.status} onChange={(event) => editBeat({ ...beat, visual: { ...beat.visual, status: event.target.value as 'idle' | 'checking' | 'passed' } })}>{['idle', 'checking', 'passed'].map((status) => <option key={status}>{status}</option>)}</select></label>}
          </fieldset>}
          <div className={styles.actions}>
            <Button type="submit" disabled={disabled || !dirty}>Save draft</Button>
            <Button variant="outline" disabled={disabled || dirty} onClick={() => { if (window.confirm('Publish this saved draft? It will become visible to learners as a new immutable revision.')) void run('Publishing saved draft…', (signal) => write('publish', signal), true); }}>Publish saved draft</Button>
            <Button variant="outline" disabled={busy || denied} onClick={() => setPreview(!preview)}>{preview ? 'Close draft preview' : 'Preview draft'}</Button>
          </div>
          {dirty && <p>Save the draft before publishing. Draft edits do not change the learner publication.</p>}
        </form>
        {preview && (previewError ? <p role="alert">Complete the draft before previewing: {previewError}</p> : <LessonReader publication={{ document }} draft />)}
        <section className={styles.history} aria-labelledby="history-title">
          <h2 id="history-title">Publication history</h2>
          <p>Newest first. Restoring copies a revision to the draft only, never directly to publication.</p>
          {!history.length && <p>No published revisions.</p>}
          <ul>{history.map((revision) => <li key={revision.revision}><div><strong>Revision {revision.revision}: {revision.title}</strong><p><time dateTime={revision.publishedAt}>{revision.publishedAt}</time></p></div>
            <Button variant="outline" disabled={disabled || dirty} onClick={() => { if (window.confirm(`Restore revision ${revision.revision} into the draft? This replaces the saved draft only. Published content will not change.`)) void run('Restoring revision to draft…', (signal) => write('restore', signal, { revision: revision.revision }), true); }}>Restore revision {revision.revision} to draft</Button>
          </li>)}</ul>
          {dirty && <p>Save or explicitly reload unsaved changes before restoring a revision.</p>}
        </section>
      </>}
    </section>
  );
}
