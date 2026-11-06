import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { PlayerButton } from './PlayerButton';
import type { PlayerController } from './usePlayerController';
import s from './player.module.css';
import { chapterPath, resolveLearningRoute } from '../learning/catalog';

/** Shared learning player. Domain modules supply snapshots/actions; this component owns presentation only. */
export function ScenePlayer({ controller: c, title, sceneTitle, index, chapters, playing, subtitle, transcript, warning,
  onToggle, onPrevious, onNext, onRestart, onSeek, previousDisabled, nextDisabled, playDisabled, progress,
  notice, authoring, overlay, information, explore, children }: {
  controller: PlayerController; title: string; sceneTitle: string; index: number; chapters: readonly string[]; playing: boolean;
  subtitle: string; transcript: string; warning?: string; notice?: string; progress?: number;
  onToggle: () => void; onPrevious: () => void; onNext: () => void; onRestart: () => void; onSeek: (index: number) => void;
  previousDisabled?: boolean; nextDisabled?: boolean; playDisabled?: boolean;
  authoring?: ReactNode; overlay?: ReactNode; information?: ReactNode; explore?: ReactNode; children: ReactNode;
}) {
  const panelTitle = useId();
  const prefs = c.preferences;
  const route = resolveLearningRoute(window.location.hash);
  const controlsVisible = c.chrome || !playing || !!c.panel || c.editing;
  const keyboard = (event: KeyboardEvent) => {
    const modal = c.editing ? c.editorElement.current : c.panel ? c.panelElement.current : null;
    if (event.key === 'Tab' && modal) {
      const items = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape') {
      if (c.editing) [...(c.editorElement.current?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Close caption editor')?.click();
      else if (c.panel) c.closePanel();
      return;
    }
    if ((event.target as HTMLElement).closest('button, input, select, textarea, a, [contenteditable="true"]') || c.editing || c.panel || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && !playDisabled) { event.preventDefault(); onToggle(); }
    else if (event.key === 'ArrowLeft' && !previousDisabled) onPrevious();
    else if (event.key === 'ArrowRight' && !nextDisabled) onNext();
    else if (event.key.toLowerCase() === 'm') c.updatePreferences({ voice: !prefs.voice });
    else if (event.key.toLowerCase() === 'c') c.updatePreferences({ subtitles: !prefs.subtitles });
    c.wake();
  };
  return <section ref={c.root} className={s.story} aria-label={title} tabIndex={0} data-player="shared"
    data-controls={controlsVisible} data-editing={c.editing} data-hidden={c.hidden || !playing || !!c.panel || c.editing} data-scene={index + 1}
    onPointerMove={c.wake} onPointerDown={c.wake} onFocusCapture={c.wake} onKeyDown={keyboard}>
    <div className={s.canvas}>{children}</div>
    <header className={s.chromeTop}>
      <div><h2>{title}</h2><p><span>{sceneTitle}</span> <span>· {index + 1} / {chapters.length}</span></p></div>
      <div className={s.controls}>{explore && <PlayerButton icon="explore" label="Explore this scene" disabled={c.editing} onClick={() => c.openPanel('explore')} />}<PlayerButton icon="info" label="Scene information and transcript" disabled={c.editing} onClick={() => c.openPanel('info')} /></div>
    </header>
    {(notice || c.fullscreenError) && <p className={s.notice} role="status">{notice || c.fullscreenError}</p>}
    {!c.panel && !c.editing && overlay}
    {!c.panel && <div className={s.subtitleArea}>
      {authoring && <div ref={c.editorElement} className={s.authoring} data-open={c.editing} role={c.editing ? 'dialog' : undefined} aria-modal={c.editing || undefined} aria-label={c.editing ? 'Caption editor' : undefined}>{authoring}</div>}
      {prefs.subtitles && !c.editing && <p className={s.subtitle} aria-label="Subtitle">{subtitle}</p>}
    </div>}
    <div className={s.bottom} data-player-controls>
      <div className={s.progress} aria-label={`Scene ${index + 1} of ${chapters.length}`}><span style={{ width: `${progress ?? (index / chapters.length) * 100}%` }} /></div>
      <div className={s.transport} role="group" aria-label="Playback controls">
        <div className={s.controls}>
          <PlayerButton icon="previous" label="Previous scene" disabled={c.editing || previousDisabled} onClick={onPrevious} />
          <PlayerButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause story' : 'Play story'} disabled={c.editing || playDisabled || !!c.panel} onClick={onToggle} />
          <PlayerButton icon="next" label="Next scene" disabled={c.editing || nextDisabled} onClick={onNext} />
          <PlayerButton icon="replay" label="Restart story" disabled={c.editing} onClick={onRestart} />
        </div>
        <div className={s.controls}>
          <PlayerButton icon={prefs.voice ? 'sound' : 'muted'} label={prefs.voice ? 'Mute narration' : 'Enable narration'} pressed={prefs.voice} disabled={c.editing} onClick={() => c.updatePreferences({ voice: !prefs.voice })} />
          <PlayerButton icon="captions" label={prefs.subtitles ? 'Hide subtitles' : 'Show subtitles'} pressed={prefs.subtitles} disabled={c.editing} onClick={() => c.updatePreferences({ subtitles: !prefs.subtitles })} />
          <PlayerButton icon="chapters" label="Choose scene" disabled={c.editing} onClick={() => c.openPanel('chapters')} />
          <PlayerButton icon="settings" label="Player settings" disabled={c.editing} onClick={() => c.openPanel('settings')} />
          <PlayerButton icon="fullscreen" label={c.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} disabled={c.editing} onClick={() => void c.changeFullscreen()} />
        </div>
      </div>
    </div>
    {c.panel && <div ref={c.panelElement} className={s.panel} role="dialog" aria-modal="true" aria-labelledby={panelTitle}>
      <header className={s.panelHeader}><h3 id={panelTitle}>{c.panel === 'chapters' ? 'Choose a scene' : c.panel === 'settings' ? 'Player settings' : c.panel === 'info' ? 'Scene information' : 'Explore this scene'}</h3><PlayerButton icon="close" label="Close panel" onClick={c.closePanel} /></header>
      {c.panel === 'chapters' && route.kind === 'skill' && route.skill.chapters.length > 1 && <nav aria-label={`${route.skill.title} chapters`} className={s.moduleLinks}>{route.skill.chapters.map(chapter => <a key={chapter.id} href={`#${chapterPath(route.skill.id, chapter.id)}`} aria-current={route.chapter?.id === chapter.id ? 'page' : undefined}>{chapter.title}</a>)}</nav>}
      {c.panel === 'chapters' && <nav aria-label="Story scenes" className={s.sceneNav}>{chapters.map((chapter, i) => <button key={`${chapter}-${i}`} aria-current={i === index ? 'step' : undefined} onClick={() => { c.setPanel(null); onSeek(i); }}>{i + 1}. {chapter}</button>)}</nav>}
      {c.panel === 'settings' && <div className={s.settings}>
        <label>Caption language<select value={prefs.language} onChange={event => c.updatePreferences({ language: event.target.value as 'en' | 'ta' })}><option value="en">English</option><option value="ta">Tamil</option></select></label>
        <label>Playback speed<select value={prefs.rate} onChange={event => c.updatePreferences({ rate: Number(event.target.value) as 1 | 1.5 | 2 })}><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
        <label><input type="checkbox" checked={prefs.voice} onChange={event => c.updatePreferences({ voice: event.target.checked })} /> Narration</label>
        <label><input type="checkbox" checked={prefs.subtitles} onChange={event => c.updatePreferences({ subtitles: event.target.checked })} /> Subtitles</label>
        <p>These preferences are shared across learning modules and remembered on this browser. Playback position and Play state are not shared.</p>
        <p>Space: play/pause · arrows: scene · M: sound · C: subtitles. Pause or open a panel to inspect.</p>
        {warning && <p role="status">{warning}</p>}
        <p>Speech failure falls back to reading-paced subtitles. Resume replays the current short subtitle. Reduced motion follows your device preference.</p>
      </div>}
      {c.panel === 'info' && <><h4>{sceneTitle}</h4><p>{transcript}</p>{information}</>}
      {c.panel === 'explore' && explore}
    </div>}
  </section>;
}
