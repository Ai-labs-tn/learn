import { Button } from '@agiler/ui';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * The lecturer's whiteboard — one full-bleed stage, one focal point, one voice.
 *
 * The track renders its world into `renderCanvas`; this frame owns the seminar mechanics:
 * the agenda chalked across the top, the spoken caption (typewriter + optional voiceover),
 * the lecture controls and keyboard stepping (←/→, space).
 */

import { useSimulator, type UseSimulatorResult } from '../useSimulator';
import { useTypewriter } from './useTypewriter';
import styles from './whiteboard.module.css';

export interface WhiteboardStep {
  caption: string;
  phase: string;
}

export function Whiteboard<T extends WhiteboardStep>({
  steps,
  renderCanvas,
}: {
  steps: readonly T[];
  renderCanvas: (sim: UseSimulatorResult<T>) => ReactNode;
}) {
  const sim = useSimulator(steps, 1600);
  const [voiceOn, setVoiceOn] = useState(false);
  const caption = useTypewriter(sim.current.caption, 14);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    sim.setSpeedMs(next ? 3600 : 1600); // let the voice finish a line before advancing
  };

  // Voiceover: speak the caption of the current step while it is on screen.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    if (!voiceOn) {
      synth.cancel();
      return undefined;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(sim.current.caption);
    utterance.rate = 1.02;
    synth.speak(utterance);
    return () => synth.cancel();
  }, [voiceOn, sim.current.caption]);

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
            onClick={toggleVoice}
            title="Read the caption aloud (browser speech)"
          >
            {voiceOn ? '🔊 Voice on' : '🔇 Voice'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}