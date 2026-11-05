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
  /** Optional human-recorded narration. If provided, it takes priority over browser TTS. */
  audioSrcEn?: string;
  audioSrcTa?: string;
  phase: string;
}

export type CaptionLanguage = 'en' | 'ta';

const PACES = [1, 1.5, 2] as const;
const BREATH_MS = 550;
const STAGE_RATIO = 1040 / 620;

/** Best available voice for a language: Tamil voices for Tamil; "Natural"/neural for English. */
function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
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

/**
 * Split a caption into sentence-sized utterances (≤ ~170 chars). Two reasons: browsers cut a
 * single long utterance around 15 seconds, and sentence chunks give natural pauses + progress.
 */
function chunkText(text: string): string[] {
  const maxChars = 150;
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]?|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      flush();
      let part = '';
      for (const word of piece.split(/\s+/)) {
        if (part && part.length + word.length + 1 > maxChars) {
          chunks.push(part);
          part = word;
        } else {
          part = part ? `${part} ${word}` : word;
        }
      }
      if (part) current = part;
    } else if (current && current.length + piece.length + 1 > maxChars) {
      flush();
      current = piece;
    } else {
      current = current ? `${current} ${piece}` : piece;
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [text];
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
  // Lecture preferences persist across tracks and reloads (Tamil stays selected once chosen).
  const preference = <T,>(key: string, fallback: T, valid: (value: unknown) => value is T): T => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (valid(parsed)) return parsed;
      }
    } catch {
      /* storage unavailable — fall through */
    }
    return fallback;
  };

  const [voiceOn, setVoiceOn] = useState<boolean>(() =>
    preference('learn.voice', false, (value): value is boolean => typeof value === 'boolean'),
  );
  const [lang, setLang] = useState<CaptionLanguage>(() =>
    preference('learn.captionLang', 'en', (value): value is CaptionLanguage => value === 'en' || value === 'ta'),
  );
  const [tamilVoiceMissing, setTamilVoiceMissing] = useState(false);
  const [speechPlaybackError, setSpeechPlaybackError] = useState(false);
  const [speechUnavailable, setSpeechUnavailable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => setReducedMotion(media.matches);
    media.addEventListener('change', refresh);
    return () => media.removeEventListener('change', refresh);
  }, []);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechVoicesReady, setSpeechVoicesReady] = useState(false);
  const [pace, setPace] = useState<number>(() =>
    preference(
      'learn.pace',
      PACES[0],
      (value): value is (typeof PACES)[number] => PACES.includes(value as (typeof PACES)[number]),
    ),
  );

  // Remember the lecture preferences (Tamil + voice + pace) across tracks and reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem('learn.voice', JSON.stringify(voiceOn));
      window.localStorage.setItem('learn.captionLang', JSON.stringify(lang));
      window.localStorage.setItem('learn.pace', JSON.stringify(pace));
    } catch {
      /* storage unavailable — preferences are session-only */
    }
  }, [voiceOn, lang, pace]);
  /** The caption in the selected language, falling back to English when no Tamil yet. */
  const spoken = lang === 'ta' && sim.current.captionTa ? sim.current.captionTa : sim.current.caption;
  const caption = useTypewriter(spoken, 14);

  // Speech voices load asynchronously in Chromium/Edge. Listen for voiceschanged and poll briefly
  // so an installed Tamil voice is not falsely reported as missing on first page load.
  const voicesSigRef = useRef('');
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) { setSpeechVoicesReady(true); return; }
    let poll: number | undefined;
    const deadline = window.setTimeout(() => { stopPolling(); setSpeechVoicesReady(true); }, 2000);
    const stopPolling = () => {
      if (poll !== undefined) {
        window.clearInterval(poll);
        poll = undefined;
      }
    };
    const refresh = () => {
      const available = synth.getVoices();
      if (available.length === 0) return;
      // Only replace state when the voice SET actually changed (order-independent): every
      // state update re-runs the playback effect, whose cleanup cancels in-flight speech.
      const signature = available
        .map((voice) => `${voice.name}:${voice.lang}`)
        .sort()
        .join('|');
      if (signature !== voicesSigRef.current) {
        voicesSigRef.current = signature;
        setSpeechVoices(available);
      }
      setSpeechVoicesReady(true);
      stopPolling(); // voices are here; later changes arrive via 'voiceschanged'
    };
    refresh();
    synth.addEventListener('voiceschanged', refresh);
    poll = window.setInterval(refresh, 250);
    return () => {
      synth.removeEventListener('voiceschanged', refresh);
      window.clearTimeout(deadline);
      stopPolling();
    };
  }, []);

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
    Math.min(16000, Math.max(2400, Math.round((text.length * 60) / pace)));

  /**
   * One speech controller. A run is superseded (not "cancelled by a cleanup") when a new run
   * starts — every callback checks its run id, so voice-list updates, re-renders or React
   * bookkeeping can never interrupt an utterance that is already speaking.
   */
  const runIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  speechVoicesRef.current = speechVoices;

  useEffect(() => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const superseded = () => runIdRef.current !== runId;
    const spoken = lang === 'ta' && sim.current.captionTa ? sim.current.captionTa : sim.current.caption;

    if (!voiceOn) {
      synth?.cancel();
      audioRef.current?.pause();
      audioRef.current = null;
      if (!sim.playing) return undefined;
      if (sim.atEnd) { sim.pause(); return undefined; }
      const timer = window.setTimeout(() => {
        if (!superseded()) sim.next();
      }, durationFor(spoken));
      return () => { runIdRef.current += 1; window.clearTimeout(timer); };
    }
    if (sim.playing && sim.atEnd) {
      sim.pause();
      return undefined;
    }

    const isTamil = lang === 'ta' && !!sim.current.captionTa;
    const audioSrc = isTamil ? sim.current.audioSrcTa : sim.current.audioSrcEn;
    const language = isTamil ? 'ta-IN' : 'en-US';
    const voice = pickVoice(speechVoicesRef.current, language);
    const timers: number[] = [];
    setSpeechPlaybackError(false);
    setSpeechUnavailable(false);
    // A new step/language supersedes any recording currently playing.
    audioRef.current?.pause();
    audioRef.current = null;
    const advanceAfter = (ms: number) => {
      const id = window.setTimeout(() => {
        if (!superseded()) sim.next();
      }, ms);
      timers.push(id);
    };

    // A supplied human recording is independent of the browser's TTS voice list.
    if (!audioSrc && (!synth || typeof window.SpeechSynthesisUtterance !== 'function')) {
      setSpeechUnavailable(true);
      if (sim.playing) advanceAfter(durationFor(spoken));
      return () => { runIdRef.current += 1; timers.forEach((id) => window.clearTimeout(id)); };
    }
    if (!audioSrc && !speechVoicesReady) return undefined;
    synth?.cancel();

    if (audioSrc) {
      const audio = new Audio(audioSrc);
      audioRef.current = audio;
      audio.onended = () => {
        if (superseded()) return;
        if (sim.playing) advanceAfter(BREATH_MS / pace);
      };
      audio.onerror = () => {
        if (superseded()) return;
        setSpeechPlaybackError(true);
        if (sim.playing) advanceAfter(durationFor(spoken));
      };
      void audio.play().catch(() => {
        if (superseded()) return;
        setSpeechPlaybackError(true);
        if (sim.playing) advanceAfter(durationFor(spoken));
      });
      return () => {
        audio.pause();
        audioRef.current = null;
        timers.forEach((id) => window.clearTimeout(id));
      };
    }

    if (!synth || !speechVoicesReady) return undefined;
    const speech = synth;

    if (isTamil && !voice) {
      // Windows may have Tamil installed while the browser exposes no Tamil voice: never fake
      // it with an English voice. The caption carries the beat at reading pace.
      setTamilVoiceMissing(true);
      if (sim.playing) advanceAfter(durationFor(spoken));
      return () => timers.forEach((id) => window.clearTimeout(id));
    }

    setTamilVoiceMissing(false);
    setSpeechPlaybackError(false);

    const chunks = chunkText(spoken);
    let index = 0;
    let retries = 0;
    const speakNext = (): void => {
      if (superseded()) return;
      if (index >= chunks.length) {
        if (sim.playing) advanceAfter(BREATH_MS / pace);
        return;
      }
      const chunk = chunks[index];
      const startedAt = Date.now();
      const expectedMs = Math.min(14000, Math.max(1200, (chunk.length * 62) / pace));
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = Math.min(2, pace);
      utterance.lang = language;
      if (voice) utterance.voice = voice;
      let didStart = false;
      let settled = false;
      let fallback: number | undefined;
      const finish = (padToExpected: boolean) => {
        if (superseded() || settled) return;
        settled = true;
        if (fallback !== undefined) window.clearTimeout(fallback);
        index += 1;
        retries = 0;
        // Engines that report "finished" instantly must not rush the lecture.
        const delay = padToExpected ? Math.max(0, expectedMs - (Date.now() - startedAt)) : 0;
        const id = window.setTimeout(speakNext, delay);
        timers.push(id);
      };
      const retry = () => {
        if (superseded() || settled) return;
        settled = true;
        if (fallback !== undefined) window.clearTimeout(fallback);
        // Retry the SAME chunk (never mark it spoken) — Chromium/Windows can emit a spurious
        // `interrupted` while voices are still warming up.
        if (retries < 4) {
          retries += 1;
          const id = window.setTimeout(speakNext, 500 * retries);
          timers.push(id);
        } else {
          setSpeechPlaybackError(true);
          sim.pause();
        }
      };
      utterance.onstart = () => {
        didStart = true;
      };
      utterance.onend = () => finish(true);
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') retry();
        else {
          setSpeechPlaybackError(true);
          sim.pause(); // show the caption and let the learner retry; do not silently skip it
        }
      };
      // Fallback: only after the estimated sentence + grace, and never while speaking.
      const checkFinished = () => {
        if (superseded() || settled) return;
        if (speech.speaking || speech.pending) {
          fallback = window.setTimeout(checkFinished, 2000);
          timers.push(fallback);
        } else if (!didStart && retries < 4) {
          retry();
        } else {
          finish(false);
        }
      };
      fallback = window.setTimeout(checkFinished, expectedMs + 8000);
      timers.push(fallback);
      speech.speak(utterance);
    };
    speakNext();

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      // No synth.cancel() here: a superseding run cancels first, so the newest audio wins.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, sim.playing, sim.index, lang, pace, speechVoicesReady]);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
    },
    [],
  );

  // The agenda: phases in order of first appearance, chalked across the top.
  const agenda = useMemo(() => {
    const items: Array<{ phase: string; at: number }> = [];
    steps.forEach((step, at) => {
      if (!items.some((item) => item.phase === step.phase)) items.push({ phase: step.phase, at });
    });
    return items;
  }, [steps]);

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]')) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
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
            onClick={() => {
              window.speechSynthesis?.cancel();
              setSpeechVoices(window.speechSynthesis?.getVoices() ?? []);
              setSpeechVoicesReady(true);
              setLang((current) => (current === 'en' ? 'ta' : 'en'));
            }}
            title="Caption language — English or Tamil (jargons stay in English). Refreshes installed speech voices."
          >
            {lang === 'en' ? '🌐 தமிழ்' : '🌐 English'}
          </Button>
          <span className={styles.stepChip}>
            {sim.index + 1} / {sim.total}
          </span>
          {tamilVoiceMissing && (
            <span
              className={styles.voiceHint}
              title="This browser hasn't exposed a Tamil voice. Open Learn with Saravana in Microsoft Edge — it ships natural Tamil voices. (In Chrome, fully quit and reopen the browser after installing Tamil speech.)"
            >
              ⚠ ta voice — use Edge
            </span>
          )}
          {speechUnavailable && <span role="status" className={styles.voiceHint}>Browser speech unavailable — reading-paced captions</span>}
          {speechPlaybackError && (
            <span className={styles.voiceHint} title="Speech playback was interrupted repeatedly. Turn Voice off/on to retry.">
              ⚠ voice paused
            </span>
          )}
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
        {reducedMotion ? spoken : caption}
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