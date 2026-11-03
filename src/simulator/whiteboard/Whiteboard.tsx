import { Button, IconButton } from '@agiler/ui';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * The lecturer's whiteboard — one full-bleed stage, one focal point, one voice.
 *
 * The whole lecture lives in a SINGLE viewport: title + controls + voice config on top, the
 * agenda tabs with the spoken caption attached underneath, and the stage sized to whatever
 * height remains (no page scrolling). Pacing follows the voice: with voice ON the next beat
 * starts when the sentence finishes; with voice OFF each caption holds for a reading pause.
 */

import { useSimulator, type UseSimulatorResult } from '../useSimulator';
import { useTypewriter } from './useTypewriter';
import styles from './whiteboard.module.css';

export interface WhiteboardStep {
  caption: string;
  /** Tamil caption (Tamil script, English jargons kept in English) — falls back to `caption`. */
  captionTa?: string;
  phase: string;
}

export type CaptionLanguage = 'en' | 'ta';

const PACES = [1, 1.5, 2] as const;
const BREATH_MS = 550;
const STAGE_RATIO = 1040 / 620;

/** Best available voice for a language: Tamil voices for Tamil; "Natural"/neural for English. */
function pickVoice(synth: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  if (lang.startsWith('ta')) {
    return voices.find((voice) => voice.lang.toLowerCase().startsWith('ta')) ?? null;
  }
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  return (
    english.find((voice) => /natural|neural|online/i.test(voice.name)) ??
    english.find((voice) => /google/i.test(voice.name)) ??
    english[0] ??
    null
  );
}

export function Whiteboard<T extends WhiteboardStep>({
  title,
  steps,
  renderCanvas,
  anchorFor,
}: {
  title: string;
  steps: readonly T[];
  renderCanvas: (sim: UseSimulatorResult<T>) => ReactNode;
  /** Board-space point (viewBox 1040×620) the phone camera should centre on this step. */
  anchorFor?: (sim: UseSimulatorResult<T>) => { x: number; y: number } | null;
}) {
  // Playback is driven here (manualAdvance) so voice and timers share one clock.
  const sim = useSimulator(steps, 1600, { manualAdvance: true });
  const [voiceOn, setVoiceOn] = useState(false);
  const [lang, setLang] = useState<CaptionLanguage>('en');
  const [pace, setPace] = useState<number>(PACES[0]);
  /** The caption in the selected language, falling back to English when no Tamil yet. */
  const spoken = lang === 'ta' && sim.current.captionTa ? sim.current.captionTa : sim.current.caption;
  const caption = useTypewriter(spoken, 14);

  const boardRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });

  // Fit the lecture to the viewport: the stage takes whatever height is left.
  useEffect(() => {
    const recompute = () => {
      const board = boardRef.current;
      const wrap = stageWrapRef.current;
      if (!board || !wrap) return;
      const top = board.getBoundingClientRect().top;
      const available = Math.max(320, window.innerHeight - top - 22);
      if (Math.abs(board.offsetHeight - available) > 1) {
        board.style.height = `${available}px`;
      }
      const rect = wrap.getBoundingClientRect();
      setWrapSize((current) =>
        Math.abs(current.w - rect.width) < 1 && Math.abs(current.h - rect.height) < 1
          ? current
          : { w: rect.width, h: rect.height },
      );
    };
    recompute();
    window.addEventListener('resize', recompute);
    const observer = new ResizeObserver(recompute);
    if (stageWrapRef.current) observer.observe(stageWrapRef.current);
    return () => {
      window.removeEventListener('resize', recompute);
      observer.disconnect();
    };
  }, []);

  /**
   * Phone camera: below 720px the stage zooms to the focused part and follows the pointer
   * (a landscape machine in a portrait screen is otherwise unreadably small). The stage stays
   * pannable — the camera only chooses the initial framing per step. Larger screens letterbox
   * the whole board, centred.
   */
  const boardAnchor = anchorFor ? anchorFor(sim) : null;
  const stage = useMemo(() => {
    const { w: wrapW, h: wrapH } = wrapSize;
    if (wrapW < 100 || wrapH < 100) return null;
    if (wrapW < 720 && boardAnchor) {
      const zoom = 1.75;
      const scale = (wrapW * zoom) / 1040;
      return { w: Math.floor(1040 * scale), h: Math.floor(620 * scale) };
    }
    const width = Math.min(wrapW, (wrapH * 1040) / 620);
    return { w: Math.floor(width), h: Math.floor((width * 620) / 1040) };
  }, [wrapSize, boardAnchor?.x, boardAnchor?.y]);

  // The camera glides to the focused part when the beat changes; the learner can still pan.
  useEffect(() => {
    const wrap = stageWrapRef.current;
    if (!wrap || !stage || !boardAnchor) return;
    if (wrap.scrollWidth <= wrap.clientWidth + 2 && wrap.scrollHeight <= wrap.clientHeight + 2) {
      return; // everything visible — no camera needed
    }
    const scale = stage.w / 1040;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const left = Math.max(
      0,
      Math.min(wrap.scrollWidth - wrap.clientWidth, boardAnchor.x * scale - wrap.clientWidth / 2),
    );
    const top = Math.max(
      0,
      Math.min(wrap.scrollHeight - wrap.clientHeight, boardAnchor.y * scale - wrap.clientHeight / 2),
    );
    wrap.scrollTo({ left, top, behavior: reduced ? 'auto' : 'smooth' });
  }, [sim.index, stage, boardAnchor?.x, boardAnchor?.y]);

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
      const spoken = lang === 'ta' && sim.current.captionTa ? sim.current.captionTa : sim.current.caption;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.rate = Math.min(2, 1 * pace);
      utterance.lang = spoken === sim.current.captionTa ? 'ta-IN' : 'en-US';
      const voice = pickVoice(synth, utterance.lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        // A short beat after the sentence lands, then move on.
        timer = window.setTimeout(advance, BREATH_MS / pace);
      };
      utterance.onerror = () => {
        timer = window.setTimeout(advance, durationFor(spoken));
      };
      // Never stall the lecture if the speech engine swallows the event.
      safety = window.setTimeout(advance, durationFor(spoken) + 5000);
      synth.speak(utterance);
    } else {
      timer = window.setTimeout(advance, durationFor(spoken));
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(safety);
      synth?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.playing, sim.index, voiceOn, pace, lang]);

  // Stepping by hand with voice ON: read each beat as it is chosen.
  useEffect(() => {
    if (sim.playing || !voiceOn) return undefined;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return undefined;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = Math.min(2, 1 * pace);
    utterance.lang = spoken === sim.current.captionTa ? 'ta-IN' : 'en-US';
    const voice = pickVoice(synth, utterance.lang);
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
    return () => synth.cancel();
  }, [voiceOn, sim.playing, spoken, pace]);

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
    <div ref={boardRef} className={styles.board} onKeyDown={onKeyDown} tabIndex={0}>
      {/* One compact top bar: the title, the voice config and the lecture controls. */}
      <div className={styles.topBar}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.controls}>
          <IconButton
            aria-label="Previous step"
            title="Previous step (←)"
            size="sm"
            variant="outline"
            onClick={sim.prev}
            disabled={sim.atStart}
          >
            ←
          </IconButton>
          <IconButton
            aria-label={sim.playing ? 'Pause lecture' : 'Play lecture'}
            title={sim.playing ? 'Pause (space)' : 'Play (space)'}
            size="sm"
            variant="solid"
            onClick={sim.toggle}
            disabled={sim.atEnd && !sim.playing}
          >
            {sim.playing ? '⏸' : '▶'}
          </IconButton>
          <IconButton
            aria-label="Next step"
            title="Next step (→)"
            size="sm"
            variant="outline"
            onClick={sim.next}
            disabled={sim.atEnd}
          >
            →
          </IconButton>
          <IconButton
            aria-label="Restart lecture"
            title="Restart"
            size="sm"
            variant="ghost"
            onClick={sim.reset}
          >
            ↺
          </IconButton>
          <IconButton
            aria-label={voiceOn ? 'Turn the voice off' : 'Read the caption aloud'}
            title={voiceOn ? 'Voice on — lecture waits for the sentence' : 'Voice off'}
            size="sm"
            variant={voiceOn ? 'solid' : 'outline'}
            onClick={() => setVoiceOn((current) => !current)}
          >
            {voiceOn ? '🔊' : '🔇'}
          </IconButton>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang((current) => (current === 'en' ? 'ta' : 'en'))}
            title="Caption language — English or Tamil (jargons stay in English)"
          >
            {lang === 'en' ? '🌐 தமிழ்' : '🌐 English'}
          </Button>
          <span className={styles.stepChip}>
            {sim.index + 1} / {sim.total}
          </span>
        </div>
      </div>

      {/* Agenda tabs, with the spoken caption attached right underneath. */}
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
              title={steps[item.at].caption}
            >
              {item.phase}
            </button>
          );
        })}
      </div>
      <p className={styles.caption} title={sim.current.caption}>
        <span className={styles.captionQuote}>&ldquo;</span>
        {caption}
        <span className={styles.caret} aria-hidden="true" />
      </p>

      {/* The stage takes whatever height remains — no page scrolling. */}
      <div ref={stageWrapRef} className={styles.stageWrap}>
        <div
          className={styles.stage}
          style={stage ? { width: stage.w, height: stage.h } : undefined}
        >
          {renderCanvas(sim)}
        </div>
      </div>
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}