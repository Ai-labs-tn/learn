import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCaptionAccess } from '../captions/CaptionAccess';
import { InlineCaptionEditor } from '../captions/InlineCaptionEditor';
import { useBootCaptions } from '../captions/useBootCaptions';
import { captionText } from '../captions/model';
import { Machine } from './Machine';
import { PlayerButton } from './PlayerButton';
import { useGuidedPlayback } from './useGuidedPlayback';
import { INSPECTION, PILOT, READS, SCENES, type Part, type ReadPattern } from './story';
import s from './hardware.module.css';

type Panel = 'chapters' | 'settings' | 'explore' | 'info' | null;
type Checkpoint = 'checks' | 'failed' | 'prediction' | 'answer' | 'done' | null;

export function HardwareStory() {
  const access = useCaptionAccess();
  const { document: lesson, ready, notice } = useBootCaptions(PILOT);
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [focus, setFocus] = useState<Part>('overview');
  const [manualEvent, setManualEvent] = useState<number | null>(null);
  const [checkpoint, setCheckpoint] = useState<Checkpoint>(null);
  const [feedback, setFeedback] = useState('');
  const [pattern, setPattern] = useState<ReadPattern>('nearby');
  const [readAt, setReadAt] = useState(-1);
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const [voice, setVoice] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [chrome, setChrome] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const root = useRef<HTMLElement>(null);
  const panelElement = useRef<HTMLDivElement>(null);
  const editorElement = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const hideTimer = useRef<number>();
  const live = useRef({ playing, panel, editing }); live.current = { playing, panel, editing };
  const current = SCENES[scene];
  const beat = PILOT.scenes[0].beats[scene];
  const text = captionText(lesson, beat.id, lang);
  const goto = (next: number, autoplay = false) => {
    if (editing) return;
    setScene(next); setPlaying(autoplay); setRun(value => value + 1); setFocus(SCENES[next].focus);
    setManualEvent(null); setCheckpoint(null); setFeedback(''); setReadAt(-1); setPanel(null); setChrome(true);
  };
  const playback = useGuidedPlayback({
    text, runKey: `${scene}-${run}-${lang}`, language: lang, voice,
    active: ready && playing && !editing && !hidden && !panel,
    onComplete: () => {
      if (scene < 5) goto(scene + 1, true);
      else { setPlaying(false); setCheckpoint(scene === 5 ? 'checks' : scene === 6 ? 'prediction' : 'done'); }
    },
  });
  const cue = Math.min(2, Math.floor(playback.index * 3 / playback.total));
  const visualEvent = manualEvent ?? cue;
  useEffect(() => {
    if (!playing || panel) return;
    setFocus(scene === 3 ? (cue === 0 ? 'firmware' : cue === 1 ? 'overview' : 'cpu') : scene === 4 ? (cue < 2 ? 'ram' : 'cpu') : SCENES[scene].focus);
  }, [scene, cue, playing, panel]);
  const wake = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const state = live.current;
      const toolbar = root.current?.querySelector('[data-player-controls]');
      const focused = document.activeElement?.matches(':focus-visible') && (toolbar?.contains(document.activeElement) || editorElement.current?.contains(document.activeElement));
      if (state.playing && !state.panel && !state.editing && !focused && !toolbar?.matches(':hover')) setChrome(false);
    }, 3000);
  };
  useEffect(() => { wake(); return () => window.clearTimeout(hideTimer.current); }, [playing, panel, editing]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', changed); };
  }, []);
  useEffect(() => {
    if (!ready || !root.current) return;
    const resize = () => {
      const element = root.current;
      if (element) element.style.setProperty('--player-height', `${Math.max(240, window.innerHeight - element.getBoundingClientRect().top - 8)}px`);
    };
    resize(); window.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize);
    if (root.current.parentElement) observer.observe(root.current.parentElement);
    return () => { window.removeEventListener('resize', resize); observer.disconnect(); };
  }, [ready]);
  useEffect(() => {
    if (panel) panelElement.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [panel]);
  const toggle = () => {
    if (editing || checkpoint || panel) return;
    if (scene === 0) goto(1, true);
    else setPlaying(value => !value);
  };
  const openPanel = (next: Panel) => {
    if (editing) return;
    opener.current = document.activeElement as HTMLElement;
    setPlaying(false); setPanel(next); setChrome(true);
  };
  const closePanel = () => { setPanel(null); setChrome(true); opener.current?.focus(); };
  const changeFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else throw new Error('Fullscreen unavailable');
    } catch { setFullscreenError('Fullscreen is unavailable in this browser. The player still works here.'); }
  };
  const keyboard = (event: KeyboardEvent) => {
    const modal = editing ? editorElement.current : panel ? panelElement.current : null;
    if (event.key === 'Tab' && modal) {
      const items = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape') {
      if (editing) [...(editorElement.current?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Close caption editor')?.click();
      else if (panel) closePanel();
      return;
    }
    if ((event.target as HTMLElement).closest('button, input, select, textarea, a, [contenteditable="true"]') || editing || panel || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ') { event.preventDefault(); toggle(); }
    else if (event.key === 'ArrowLeft' && scene > 0) goto(scene - 1);
    else if (event.key === 'ArrowRight' && scene > 0 && scene < 7 && !checkpoint) goto(scene + 1, playing);
    else if (event.key.toLowerCase() === 'm') setVoice(value => !value);
    else if (event.key.toLowerCase() === 'c') setSubtitles(value => !value);
    wake();
  };
  if (!ready) return <p role="status">Loading hardware story…</p>;
  const controlsVisible = chrome || !playing || !!panel || editing;
  return (
    <section ref={root} className={s.story} aria-label="Inside the machine" tabIndex={0}
      data-controls={controlsVisible} data-editing={editing} data-hidden={hidden || !playing || !!panel || editing} data-scene={scene + 1}
      onPointerMove={wake} onPointerDown={wake} onFocusCapture={wake} onKeyDown={keyboard}>
      <div className={s.canvas}>
        <Machine scene={scene} focus={focus} powered={scene > 0 && checkpoint !== 'answer'} event={visualEvent}
          failed={checkpoint === 'failed'} readBlock={readAt < 0 ? null : READS[pattern][readAt]}
          onPower={() => { if (!editing && !panel && scene === 0) goto(1, true); }} />
      </div>
      <header className={s.chromeTop}>
        <div><h2>Inside the machine</h2><p>{current.title} <span>· {scene + 1} / 8</span></p></div>
        <div className={s.controls}><PlayerButton icon="explore" label="Explore this scene" disabled={editing} onClick={() => openPanel('explore')} /><PlayerButton icon="info" label="Scene information and transcript" disabled={editing} onClick={() => openPanel('info')} /></div>
      </header>
      {(notice || fullscreenError) && <p className={s.notice} role="status">{notice || fullscreenError}</p>}
      {scene === 0 && !panel && !editing && <button type="button" className={s.powerStart} aria-label="Press the power button" onClick={() => goto(1, true)}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 2v10M6 5a9 9 0 1 0 12 0" /></svg><span>Press power to begin</span>
      </button>}
      {!panel && <div className={s.subtitleArea}>
        {access && <div ref={editorElement} className={s.authoring} data-open={editing} role={editing ? 'dialog' : undefined} aria-modal={editing || undefined} aria-label={editing ? 'Caption editor' : undefined}>
          <InlineCaptionEditor key={`${beat.id}-${lang}`} compact baseline={PILOT} stepId={beat.id} phase={current.title} language={lang}
            onEditing={open => { setPlaying(false); setEditing(open); setChrome(true); if (!open) window.setTimeout(() => editorElement.current?.querySelector<HTMLButtonElement>('[aria-label="Edit caption"]')?.focus(), 0); }} />
        </div>}
        {subtitles && !editing && <p className={s.subtitle} aria-label="Subtitle">{playback.subtitle}</p>}
      </div>}
      {checkpoint && !panel && !editing && <div className={s.checkpoint} role="region" aria-label="Scene checkpoint">
        {checkpoint === 'checks' && <><p>Startup checks: what would you like to see?</p><div className={s.controls}><button onClick={() => goto(6, true)}>✓ Continue normal startup</button><button onClick={() => { setCheckpoint('failed'); setFocus('ram'); }}>⚠ Try a memory failure</button></div></>}
        {checkpoint === 'failed' && <><p role="status">Memory check failed. Startup stopped; no real hardware was changed.</p><button onClick={() => goto(5, true)}>↻ Retry startup checks</button></>}
        {checkpoint === 'prediction' && <><p>Power is removed. Which information remains?</p><div className={s.controls}><button onClick={() => setFeedback('RAM is volatile; its working value is not reliably retained. Try again.')}>RAM working value</button><button onClick={() => { setCheckpoint('answer'); setFeedback(''); setFocus('overview'); }}>Saved file on SSD / HDD</button></div>{feedback && <p role="status">{feedback}</p>}</>}
        {checkpoint === 'answer' && <><p role="status">Correct. RAM loses its working state; storage retains the saved file.</p><button onClick={() => goto(7, true)}>Continue to storage inspection →</button></>}
        {checkpoint === 'done' && <><p>Ready to compare nearby and scattered reads?</p><div className={s.controls}><button onClick={() => openPanel('explore')}>Explore storage</button><button onClick={() => goto(0)}>↻ Replay story</button></div></>}
      </div>}
      <div className={s.bottom} data-player-controls>
        <div className={s.progress} aria-label={`Scene ${scene + 1} of 8`}><span style={{ width: `${((scene + playback.index / playback.total) / 8) * 100}%` }} /></div>
        <div className={s.transport} role="group" aria-label="Playback controls">
          <div className={s.controls}>
            <PlayerButton icon="previous" label="Previous scene" disabled={editing || scene === 0} onClick={() => goto(scene - 1)} />
            <PlayerButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause story' : 'Play story'} disabled={editing || !!checkpoint || !!panel} onClick={toggle} />
            <PlayerButton icon="next" label="Next scene" disabled={editing || scene === 0 || scene === 7 || !!checkpoint} onClick={() => goto(scene + 1, playing)} />
            <PlayerButton icon="replay" label="Restart hardware story" disabled={editing} onClick={() => goto(0)} />
          </div>
          <div className={s.controls}>
            <PlayerButton icon={voice ? 'sound' : 'muted'} label={voice ? 'Mute narration' : 'Enable narration'} pressed={voice} disabled={editing} onClick={() => setVoice(!voice)} />
            <PlayerButton icon="captions" label={subtitles ? 'Hide subtitles' : 'Show subtitles'} pressed={subtitles} disabled={editing} onClick={() => setSubtitles(!subtitles)} />
            <PlayerButton icon="chapters" label="Choose scene" disabled={editing} onClick={() => openPanel('chapters')} />
            <PlayerButton icon="settings" label="Player settings" disabled={editing} onClick={() => openPanel('settings')} />
            <PlayerButton icon="fullscreen" label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} disabled={editing} onClick={() => void changeFullscreen()} />
          </div>
        </div>
      </div>
      {panel && <div ref={panelElement} className={s.panel} role="dialog" aria-modal="true" aria-labelledby="player-panel-title">
        <header className={s.panelHeader}><h3 id="player-panel-title">{panel === 'chapters' ? 'Choose a scene' : panel === 'settings' ? 'Player settings' : panel === 'info' ? 'Scene information' : 'Explore this scene'}</h3><PlayerButton icon="close" label="Close panel" onClick={closePanel} /></header>
        {panel === 'chapters' && <nav aria-label="Hardware story scenes" className={s.sceneNav}>{SCENES.map((item, index) => <button key={item.title} aria-current={scene === index ? 'step' : undefined} onClick={() => goto(index)}>{index + 1}. {item.title}</button>)}</nav>}
        {panel === 'settings' && <div className={s.settings}>
          <label>Caption language<select value={lang} onChange={event => setLang(event.target.value as 'en' | 'ta')}><option value="en">English</option><option value="ta">Tamil</option></select></label>
          <label><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} /> Narration</label>
          <label><input type="checkbox" checked={subtitles} onChange={event => setSubtitles(event.target.checked)} /> Subtitles</label>
          <p>Play runs the story automatically. Pause to inspect; use the scene list to jump. Space: play/pause · arrows: scene · M: sound · C: subtitles.</p>
          {playback.warning && <p role="status">{playback.warning}</p>}
          <p>Speech failure falls back to reading-paced subtitles. Pause/resume restarts the current short subtitle. Reduced-motion preference removes decorative motion without preventing story progress.</p>
        </div>}
        {panel === 'info' && <>
          <h4>{current.title}</h4><p>{text}</p><p>{INSPECTION[focus]}</p>
          <h4>Illustration key</h4><p>Gold: power/control · blue: instruction fetch · cyan: working data. Highlights show concepts, not literal particles, wiring or measured timing.</p>
          <p>CPU and processor name the same part. Firmware is software. TCP ports are logical software endpoints, not physical network connectors. OS launch, Chrome, remote requests and the JVM are later chapters.</p>
        </>}
        {panel === 'explore' && <>
          <div className={s.controls}>{(['overview','cpu','ram','firmware','storage'] as const).map(part => <button key={part} aria-pressed={part === focus} onClick={() => setFocus(part)}>{part === 'overview' ? 'Whole machine' : part === 'storage' ? 'SSD / HDD' : part.toUpperCase()}</button>)}</div>
          <p>{INSPECTION[focus]}</p>
          {scene === 3 && <button onClick={() => { setManualEvent(visualEvent < 2 ? visualEvent + 1 : 0); setFocus(visualEvent < 1 ? 'overview' : 'cpu'); }}>Step instruction fetch / execution</button>}
          {scene === 4 && <><p>RAM example: {visualEvent > 0 ? '17' : 'not written'} · CPU register: {visualEvent > 1 ? '17' : 'not read yet'}</p><button onClick={() => { setManualEvent(visualEvent < 2 ? visualEvent + 1 : 0); setFocus(visualEvent < 1 ? 'ram' : 'cpu'); }}>Step memory write / read</button></>}
          {scene === 5 && <button onClick={() => { setPanel(null); setCheckpoint('failed'); setFocus('ram'); }}>Try a memory-check failure</button>}
          {scene === 7 && <>
            <p>Separate inspection lab—not the startup timeline.</p>
            <div className={s.controls}>{(['nearby','scattered'] as const).map(value => <button key={value} aria-pressed={pattern === value} onClick={() => { setPattern(value); setReadAt(-1); }}>{value === 'nearby' ? 'Nearby reads' : 'Scattered reads'}</button>)}</div>
            <p>Illustrative requests: {READS[pattern].join(' → ')}</p><button onClick={() => { setReadAt((readAt + 1) % 4); setFocus('storage'); }}>Read next example block</button>
            {readAt >= 0 && <p role="status">Block {READS[pattern][readAt]}: HDD head {pattern === 'scattered' ? 'repositions farther' : 'visits nearby locations'}; SSD addresses flash with no moving read head.</p>}
            <p>No benchmark timings are implied. Logical block numbers are not a literal disk geometry mapping. These drives use SATA; NVMe SSDs use PCIe.</p>
          </>}
          <p>Close this panel, then press Play to resume the story.</p>
        </>}
      </div>}
    </section>
  );
}
