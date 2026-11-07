import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSimulator, type UseSimulatorResult } from '../simulator/useSimulator';
import type { WhiteboardStep } from '../simulator/whiteboard/Whiteboard';
import { ScenePlayer } from './ScenePlayer';
import { usePlayerController } from './usePlayerController';
import { useGuidedPlayback } from './useGuidedPlayback';
import s from './player.module.css';

function SnapshotCanvas<T>({ sim, renderCanvas, anchorFor }: { sim: UseSimulatorResult<T>; renderCanvas: (sim: UseSimulatorResult<T>) => ReactNode; anchorFor?: (sim: UseSimulatorResult<T>) => { x: number; y: number } | null }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  const anchor = anchorFor?.(sim);
  const width = size.width < 720 && anchor ? size.width * 1.65 : Math.min(size.width, size.height * 1040 / 620);
  const height = width * 620 / 1040;
  useEffect(() => {
    const element = viewport.current; if (!element || !anchor || !width) return;
    element.scrollTo({ left: Math.max(0, anchor.x * width / 1040 - size.width / 2), top: Math.max(0, anchor.y * width / 1040 - size.height / 2), behavior: 'auto' });
  }, [sim.index, width, size.width, size.height, anchor?.x, anchor?.y]);
  return <div ref={viewport} className={s.snapshotViewport}><div className={s.snapshotPlane} style={{ width, height }}>{width > 0 && renderCanvas(sim)}</div></div>;
}

/** Adapter for deterministic JVM/bytecode/DSA snapshots; no subject-specific player implementation. */
export function SnapshotPlayer<T extends WhiteboardStep>({ title, steps, renderCanvas, anchorFor, microsteps = false, renderCaptionTools, startLabel, fluid = false }: {
  title: string; steps: readonly T[]; renderCanvas: (sim: UseSimulatorResult<T>) => ReactNode;
  anchorFor?: (sim: UseSimulatorResult<T>) => { x: number; y: number } | null; microsteps?: boolean; startLabel?: string; fluid?: boolean;
  renderCaptionTools?: (step: T, language: 'en' | 'ta', onEditing: (open: boolean) => void) => ReactNode;
}) {
  const sim = useSimulator(steps, 1600, { manualAdvance: true });
  const [run, setRun] = useState(0);
  const c = usePlayerController({ playing: sim.playing, onPause: sim.pause });
  const { language, voice, rate } = c.preferences;
  const translated = language === 'ta' && !!sim.current.captionTa;
  const text = translated ? sim.current.captionTa! : sim.current.caption;
  const seek = (index: number) => { sim.pause(); sim.jumpTo(index); setRun(value => value + 1); c.setPanel(null); };
  const playback = useGuidedPlayback({ text, runKey: `${sim.index}-${run}-${language}`, language: translated ? 'ta' : 'en', voice, rate, voiceId: translated ? c.preferences.voiceTa : c.preferences.voiceEn,
    active: sim.playing && !c.hidden && !c.panel && !c.editing,
    onComplete: () => { if (sim.atEnd) sim.pause(); else sim.next(); },
  });
  const chapterNames = steps.map((step, index) => `${index + 1}: ${step.phase}`);
  const snapshotSim = { ...sim, jumpTo: seek };
  return <ScenePlayer controller={c} title={title} sceneTitle={microsteps ? `Micro-step ${sim.index + 1} of ${sim.total}` : sim.current.phase}
    index={sim.index} chapters={chapterNames} playing={sim.playing} subtitle={playback.subtitle} transcript={text}
    warning={playback.warning || (language === 'ta' && !translated ? 'Tamil caption unavailable for this scene; English is used.' : '')}
    previousDisabled={sim.atStart} nextDisabled={sim.atEnd} onToggle={sim.toggle}
    onPrevious={() => seek(sim.index - 1)} onNext={() => seek(sim.index + 1)} onRestart={() => seek(0)} onSeek={seek}
    overlay={startLabel && sim.atStart && !sim.playing ? <button type="button" className={s.powerStart} onClick={sim.play}>{startLabel}</button> : undefined}
    authoring={renderCaptionTools?.(sim.current, language, open => { sim.pause(); c.setEditing(open); c.setChrome(true); if (!open) window.setTimeout(() => c.editorElement.current?.querySelector<HTMLButtonElement>('[aria-label="Edit caption"]')?.focus(), 0); })}
    progress={((sim.index + playback.index / playback.total) / sim.total) * 100}>
    {fluid ? renderCanvas(snapshotSim) : <SnapshotCanvas sim={snapshotSim} renderCanvas={renderCanvas} anchorFor={anchorFor} />}
  </ScenePlayer>;
}
