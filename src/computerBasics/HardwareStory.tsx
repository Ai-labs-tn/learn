import { useEffect, useState } from 'react';
import { useCaptionAccess } from '../captions/CaptionAccess';
import { InlineCaptionEditor } from '../captions/InlineCaptionEditor';
import { useBootCaptions } from '../captions/useBootCaptions';
import { captionText } from '../captions/model';
import { ScenePlayer } from '../player/ScenePlayer';
import { usePlayerController } from '../player/usePlayerController';
import { useGuidedPlayback } from '../player/useGuidedPlayback';
import { Machine } from './Machine';
import { INSPECTION, PILOT, READS, SCENES, type Part, type ReadPattern } from './story';
import s from '../player/player.module.css';

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
  const c = usePlayerController({ playing, onPause: () => setPlaying(false), ready });
  const { language: lang, voice, rate } = c.preferences;
  const current = SCENES[scene], beat = PILOT.scenes[0].beats[scene];
  const text = captionText(lesson, beat.id, lang);
  const goto = (next: number, autoplay = false) => {
    if (c.editing) return;
    setScene(next); setPlaying(autoplay); setRun(value => value + 1); setFocus(SCENES[next].focus);
    setManualEvent(null); setCheckpoint(null); setFeedback(''); setReadAt(-1); c.setPanel(null); c.setChrome(true);
  };
  const playback = useGuidedPlayback({ text, runKey: `${scene}-${run}-${lang}`, language: lang, voice, rate,
    active: ready && playing && !c.editing && !c.hidden && !c.panel,
    onComplete: () => {
      if (scene < 5) goto(scene + 1, true);
      else { setPlaying(false); setCheckpoint(scene === 5 ? 'checks' : scene === 6 ? 'prediction' : 'done'); }
    },
  });
  const cue = Math.min(2, Math.floor(playback.index * 3 / playback.total));
  const visualEvent = manualEvent ?? cue;
  useEffect(() => {
    if (!playing || c.panel) return;
    setFocus(scene === 3 ? (cue === 0 ? 'firmware' : cue === 1 ? 'overview' : 'cpu') : scene === 4 ? (cue < 2 ? 'ram' : 'cpu') : SCENES[scene].focus);
  }, [scene, cue, playing, c.panel]);
  if (!ready) return <p role="status">Loading hardware story…</p>;
  const overlay = <>
    {scene === 0 && <button type="button" className={s.powerStart} aria-label="Press the power button" onClick={() => goto(1, true)}><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 2v10M6 5a9 9 0 1 0 12 0" /></svg><span>Press power to begin</span></button>}
    {checkpoint && <div className={s.checkpoint} role="region" aria-label="Scene checkpoint">
      {checkpoint === 'checks' && <><p>Startup checks: what would you like to see?</p><div className={s.controls}><button onClick={() => goto(6, true)}>✓ Continue normal startup</button><button onClick={() => { setCheckpoint('failed'); setFocus('ram'); }}>⚠ Try a memory failure</button></div></>}
      {checkpoint === 'failed' && <><p role="status">Memory check failed. Startup stopped; no real hardware was changed.</p><button onClick={() => goto(5, true)}>↻ Retry startup checks</button></>}
      {checkpoint === 'prediction' && <><p>Power is removed. Which information remains?</p><div className={s.controls}><button onClick={() => setFeedback('RAM is volatile; its working value is not reliably retained. Try again.')}>RAM working value</button><button onClick={() => { setCheckpoint('answer'); setFeedback(''); setFocus('overview'); }}>Saved file on SSD / HDD</button></div>{feedback && <p role="status">{feedback}</p>}</>}
      {checkpoint === 'answer' && <><p role="status">Correct. RAM loses its working state; storage retains the saved file.</p><button onClick={() => goto(7, true)}>Continue to storage inspection →</button></>}
      {checkpoint === 'done' && <><p>Ready to compare nearby and scattered reads?</p><div className={s.controls}><button onClick={() => c.openPanel('explore')}>Explore storage</button><button onClick={() => goto(0)}>↻ Replay story</button></div></>}
    </div>}
  </>;
  const explore = <>
    <div className={s.controls}>{(['overview','cpu','ram','firmware','storage'] as const).map(part => <button key={part} aria-pressed={part === focus} onClick={() => setFocus(part)}>{part === 'overview' ? 'Whole machine' : part === 'storage' ? 'SSD / HDD' : part.toUpperCase()}</button>)}</div>
    <p>{INSPECTION[focus]}</p>
    {scene === 3 && <button onClick={() => { setManualEvent(visualEvent < 2 ? visualEvent + 1 : 0); setFocus(visualEvent < 1 ? 'overview' : 'cpu'); }}>Step instruction fetch / execution</button>}
    {scene === 4 && <><p>RAM example: {visualEvent > 0 ? '17' : 'not written'} · CPU register: {visualEvent > 1 ? '17' : 'not read yet'}</p><button onClick={() => { setManualEvent(visualEvent < 2 ? visualEvent + 1 : 0); setFocus(visualEvent < 1 ? 'ram' : 'cpu'); }}>Step memory write / read</button></>}
    {scene === 5 && <button onClick={() => { c.setPanel(null); setCheckpoint('failed'); setFocus('ram'); }}>Try a memory-check failure</button>}
    {scene === 7 && <>
      <p>Separate inspection lab—not the startup timeline.</p>
      <div className={s.controls}>{(['nearby','scattered'] as const).map(value => <button key={value} aria-pressed={pattern === value} onClick={() => { setPattern(value); setReadAt(-1); }}>{value === 'nearby' ? 'Nearby reads' : 'Scattered reads'}</button>)}</div>
      <p>Illustrative requests: {READS[pattern].join(' → ')}</p><button onClick={() => { setReadAt((readAt + 1) % 4); setFocus('storage'); }}>Read next example block</button>
      {readAt >= 0 && <p role="status">Block {READS[pattern][readAt]}: HDD head {pattern === 'scattered' ? 'repositions farther' : 'visits nearby locations'}; SSD addresses flash with no moving read head.</p>}
      <p>No benchmark timings are implied. Logical block numbers are not a literal disk geometry mapping. These drives use SATA; NVMe SSDs use PCIe.</p>
    </>}
    <p>Close this panel, then press Play to resume the story.</p>
  </>;
  return <ScenePlayer controller={c} title="Inside the machine" sceneTitle={current.title} index={scene} chapters={SCENES.map(item => item.title)} playing={playing}
    subtitle={playback.subtitle} transcript={text} warning={playback.warning} notice={notice} progress={((scene + playback.index / playback.total) / 8) * 100}
    previousDisabled={scene === 0} nextDisabled={scene === 0 || scene === 7 || !!checkpoint} playDisabled={!!checkpoint}
    onPrevious={() => goto(scene - 1)} onNext={() => goto(scene + 1, playing)} onRestart={() => goto(0)} onSeek={index => goto(index)}
    onToggle={() => { if (!checkpoint) { if (scene === 0) goto(1, true); else setPlaying(value => !value); } }} overlay={overlay} explore={explore}
    information={<><p>{INSPECTION[focus]}</p><p>Gold: power/control · blue: instruction fetch · cyan: working data. Highlights show concepts, not literal particles, wiring or measured timing.</p><p>TCP ports are software endpoints, not physical connectors. OS launch, Chrome and Java are subsequent slices.</p></>}
    authoring={access && <InlineCaptionEditor key={`${beat.id}-${lang}`} compact baseline={PILOT} stepId={beat.id} phase={current.title} language={lang}
      onEditing={open => { setPlaying(false); c.setEditing(open); c.setChrome(true); if (!open) window.setTimeout(() => c.editorElement.current?.querySelector<HTMLButtonElement>('[aria-label="Edit caption"]')?.focus(), 0); }} />}>
    <Machine scene={scene} focus={focus} powered={scene > 0 && checkpoint !== 'answer'} event={visualEvent} failed={checkpoint === 'failed'} readBlock={readAt < 0 ? null : READS[pattern][readAt]}
      onPower={() => { if (!c.editing && !c.panel && scene === 0) goto(1, true); }} />
  </ScenePlayer>;
}
