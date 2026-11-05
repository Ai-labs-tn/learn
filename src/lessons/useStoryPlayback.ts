import { useEffect, useRef, useState } from 'react';
import type { Language, LessonBeat } from './types';

/** Reading pace is a caption fallback, not an estimate of speech completion. */
export function readingDuration(text: string): number {
  return Math.max(2400, Math.min(45000, text.trim().split(/\s+/u).length * 350 + text.length * 25));
}

/** The current renderer reconstructs the whole visual immediately; its focus settles in 300ms. */
export function visualDuration(reducedMotion: boolean): number { return reducedMotion ? 0 : 300; }

export function storedPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return valid(value) ? value : fallback;
  } catch { return fallback; }
}

export function useStoryPlayback(beats: LessonBeat[], language: Language, documentId: string) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => storedPreference('learn.voice', false, (v): v is boolean => typeof v === 'boolean'));
  const [status, setStatus] = useState('Ready.');
  const [run, setRun] = useState(0);
  const generation = useRef(0);
  const stop = useRef<() => void>(() => {});
  const current = useRef(beats);
  current.current = beats;
  const voices = useRef<SpeechSynthesisVoice[]>([]);

  const cancel = () => { generation.current++; stop.current(); };
  const navigate = (next: number) => {
    cancel();
    setIndex(Math.max(0, Math.min(current.current.length - 1, next)));
    setRun((value) => value + 1);
  };

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => {
      const available = synth.getVoices();
      voices.current = available;
    };
    refresh();
    synth.addEventListener('voiceschanged', refresh);
    return () => synth.removeEventListener('voiceschanged', refresh);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem('learn.voice', JSON.stringify(voiceOn)); } catch { /* session only */ }
  }, [voiceOn]);

  useEffect(() => {
    if (index >= beats.length) {
      cancel();
      setIndex(Math.max(0, beats.length - 1));
      setPlaying(false);
      setStatus('Story structure changed. Replay the current beat.');
    }
  }, [beats.length, index]);

  useEffect(() => {
    cancel(); setPlaying(false); setIndex(0); setStatus('Ready.');
    // Document edits do not interrupt a run; only switching lessons resets playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    const id = ++generation.current;
    const synth = window.speechSynthesis;
    const timers = new Set<number>();
    let utterance: SpeechSynthesisUtterance | undefined;
    let speakingOwned = false;
    let disposed = false;
    const alive = () => !disposed && id === generation.current;
    const later = (callback: () => void, ms: number) => {
      const timer = window.setTimeout(() => { timers.delete(timer); if (alive()) callback(); }, ms);
      timers.add(timer);
    };
    const cleanup = () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (utterance) { utterance.onend = null; utterance.onerror = null; }
      if (speakingOwned) synth?.cancel();
    };
    stop.current = cleanup;
    if (!playing) return cleanup;
    const beat = current.current[Math.min(index, current.current.length - 1)];
    if (!beat) { setPlaying(false); return cleanup; }
    // Snapshot only on a new run: edits during speech take effect on replay, never per keystroke.
    const narration = beat.narration[language];
    const caption = beat.captions?.[language] ?? narration;
    let visualDone = false;
    let narrationDone = false;
    const advance = () => {
      if (!alive() || !visualDone || !narrationDone) return;
      // Even an erroneous early onend must not advance while the engine reports active speech.
      if (synth?.speaking || synth?.pending) return;
      cleanup(); // Settle once, even if more completion callbacks arrive before React renders.
      if (index >= current.current.length - 1) { setPlaying(false); setStatus('Story complete. Restart story to replay.'); }
      else { setIndex((value) => value + 1); setRun((value) => value + 1); }
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    later(() => { visualDone = true; advance(); }, visualDuration(reduced));
    const captionsOnly = (message: string) => {
      setStatus(message);
      later(() => { narrationDone = true; advance(); }, readingDuration(caption));
    };
    const stalled = () => {
      if (!alive()) return;
      // Bounded recovery: never infer completion or skip a beat while speech is active.
      setStatus('Speech did not finish reliably. Playback paused. Use Next beat to continue, Play story to retry, or Voice off for captions.');
      setPlaying(false);
      cleanup();
    };
    if (!voiceOn) captionsOnly('Voice off. Captions advance at reading pace.');
    else if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      captionsOnly('Browser speech is unavailable. Continuing with captions at reading pace.');
    } else {
      const speak = () => {
        const voice = voices.current.find((candidate) => candidate.lang.toLowerCase().startsWith(language));
        if (!voice) {
          captionsOnly(`${language === 'ta' ? 'Tamil' : 'English'} voice unavailable in this browser. Continuing with captions at reading pace.`);
          return;
        }
        utterance = new SpeechSynthesisUtterance(narration);
        utterance.lang = language === 'ta' ? 'ta-IN' : 'en-US';
        utterance.voice = voice;
        utterance.onend = () => { if (alive()) { narrationDone = true; advance(); } };
        utterance.onerror = () => {
          if (!alive()) return;
          stalled();
        };
        setStatus('Narrating this beat.');
        speakingOwned = true;
        try { synth.speak(utterance); } catch { stalled(); }
      };
      // Chromium may initially expose no voices. Discovery remains live through voiceschanged;
      // a bounded wait ensures an empty voice list never leaves playback stuck.
      if (!voices.current.length) { setStatus('Discovering browser voices…'); later(speak, 1500); }
      else speak();
    }
    // Poll only for completion already signalled by onend; never time speech from word boundaries.
    const check = () => { advance(); if (alive()) later(check, 250); };
    later(check, 250);
    later(stalled, Math.max(60000, readingDuration(caption) + 15000));
    return cleanup;
    // Voice discovery updates the ref without cancelling an utterance already in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, language, voiceOn, run]);

  return {
    index, playing, voiceOn, status,
    toggle: () => { cancel(); setPlaying((value) => !value); setRun((value) => value + 1); },
    previous: () => navigate(index - 1), next: () => navigate(index + 1),
    restart: () => { navigate(0); },
    toggleVoice: () => { cancel(); setVoiceOn((value) => !value); },
    changeLanguage: cancel,
  };
}
