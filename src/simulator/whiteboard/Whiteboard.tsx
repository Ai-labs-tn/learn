import { Button } from '@agiler/ui';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * The lecturer's whiteboard — one full-bleed stage, one focal point, one voice.
 *
 * Pacing is lecture-paced, not timer-paced: with voice ON, the next beat starts when the
 * narration of the current beat FINISHES (plus a short breath); with voice OFF, each caption
 * stays for a reading-length pause computed from its own text. A pace control scales both.
 */

import { useSimulator, type UseSimulatorResult } from '../useSimulator';
import { useTypewriter } from './useTypewriter';
import styles from './whiteboard.module.css';

export interface WhiteboardStep {
  caption: string;
  phase: string;
}

const PACES = [1, 1.5, 2] as const;
const BREATH_MS = 550;

export function Whiteboard<T extends WhiteboardStep>({
  steps,
  renderCanvas,
}: {
  steps: readonly T[];
  renderCanvas: (sim: UseSimulatorResult<T>) => ReactNode;
}) {
  // Playback is driven here (manualAdvance) so voice and timers share one clock.
  const sim = useSimulator(steps, 1600, { manualAdvance: true });
  const [voiceOn, setVoiceOn] = useState(false);
  const [pace, setPace] = useState<number>(PACES[0]);
  const caption = useTypewriter(sim.current.caption, 14);

  /** How long a caption should stay on screen when it is not being spoken. */
  const durationFor = (text: string): number =>
    Math.min(12000, Math.max(2400, Math.round((text.length * 55) / pace)));

  // Playback: advance on the speaker's rhythm (or a reading pause when silent).
  useEffect(() => {
    if (!sim.playing) return undefined;
    if (sim.atEnd) {
      sim.pause();
      return undefined;
    }

    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    let cancelled = false;
    let timer: number | undefined;
    let safety: number | undefined;
    const advance = () => {
      if (!cancelled) sim.next();
    };

    if (voiceOn && synth) {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(sim.current.caption);
      utterance.rate = Math.min(2, 1 * pace);
      utterance.onend = () => {
        // A short beat after the sentence lands, then move on.
        timer = window.setTimeout(advance, BREATH_MS / pace);
      };
      utterance.onerror = () => {
        timer = window.setTimeout(advance, durationFor(sim.current.caption));
      };
      // Never stall the lecture if the speech engine swallows the event.
      safety = window.setTimeout(advance, durationFor(sim.current.caption) + 5000);
      synth.speak(utterance);
    } else {
      timer = window.setTimeout(advance, durationFor(sim.current.caption));
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(safety);
      synth?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.playing, sim.index, voiceOn, pace]);

  // Stepping by hand with voice ON: read each beat as it is chosen.
  useEffect(() => {
    if (sim.playing || !voiceOn) return undefined;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return undefined;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(sim.current.caption);
    utterance.rate = Math.min(2, 1 * pace);
    synth.speak(utterance);
    return () => synth.cancel();
  }, [voiceOn, sim.playing, sim.current.caption, pace]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // The agenda: phases in order of first appearance, chalked across the top.
  const agenda = useMemo(() => {
    const items: Array<{ phase: string; at: number }> = [];
    steps.forEach((step, at) => {
      if (!items.some((item) => item.phase === step.phase)) items.push({ phase: step.phase, at });
    });
    return items;
  }, [steps]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') sim.next();
    else if (event.key === 'ArrowLeft') sim.prev();
    else if (event.key === ' ') {
      event.preventDefault();
      sim.toggle();
    }
  };

  const cyclePace = () => {
    const at = PACES.indexOf(pace as (typeof PACES)[number]);
    setPace(PACES[(at + 1) % PACES.length]);
  };

  return (
    <div className={styles.board} onKeyDown={onKeyDown} tabIndex={0}>
      <div className={styles.agenda}>
        {agenda.map((item) => {
          const done = sim.index > item.at;
          const current = sim.current.phase === item.phase;
          return (
            <button
              key={item.phase}
              type="button"
              className={cn(styles.pill, done && styles.pillDone, current && styles.pillCurrent)}
              onClick={() => sim.jumpTo(item.at)}
            >
              {item.phase}
            </button>
          );
        })}
        <span className={styles.stepChip}>
          {sim.index + 1} / {sim.total}
        </span>
      </div>

      <div className={styles.stageWrap}>
        <div className={styles.stage}>{renderCanvas(sim)}</div>
      </div>

      <div className={styles.bottom}>
        <p className={styles.caption}>
          <span className={styles.captionQuote}>&ldquo;</span>
          {caption}
          <span className={styles.caret} aria-hidden="true" />
        </p>
        <div className={styles.controls}>
          <Button variant="outline" size="sm" onClick={sim.prev} disabled={sim.atStart}>
            ← Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={sim.toggle}
            disabled={sim.atEnd && !sim.playing}
          >
            {sim.playing ? 'Pause' : 'Play'}
          </Button>
          <Button variant="outline" size="sm" onClick={sim.next} disabled={sim.atEnd}>
            Next →
          </Button>
          <Button variant="ghost" size="sm" onClick={sim.reset}>
            Restart
          </Button>
          <Button
            variant={voiceOn ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setVoiceOn((current) => !current)}
            title="Read the caption aloud — the lecture waits for the voice to finish"
          >
            {voiceOn ? '🔊 Voice on' : '🔇 Voice'}
          </Button>
          <Button variant="ghost" size="sm" onClick={cyclePace} title="Lecture pace">
            {pace}× pace
          </Button>
        </div>
      </div>
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}