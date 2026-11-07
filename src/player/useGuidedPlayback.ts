import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseVoice, useBrowserVoices } from './useBrowserVoices';

/** Small subtitle/narration units: do not truncate an edited caption or hide its tail. */
export function subtitleSegments(text: string): string[] {
  const result: string[] = [];
  let chunk = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (chunk && (chunk.length + word.length > 125 || /[.!?]$/.test(chunk))) { result.push(chunk); chunk = ''; }
    chunk += (chunk ? ' ' : '') + word;
  }
  if (chunk) result.push(chunk);
  return result.length ? result : [''];
}

/** One clock owns subtitle progress, narration and visual cue indices. Pause replays the current short unit. */
export function useGuidedPlayback({ text, runKey, active, voice, language, rate = 1, voiceId = '', onComplete }: {
  text: string; runKey: string; active: boolean; voice: boolean; language: 'en' | 'ta'; rate?: number; voiceId?: string; onComplete: () => void;
}) {
  const segments = useMemo(() => subtitleSegments(text), [text]);
  const browserVoices = useBrowserVoices();
  // Updating the catalogue must not restart a sentence already being spoken.
  const voices = useRef(browserVoices); voices.current = browserVoices;
  const [index, setIndex] = useState(0);
  const [warning, setWarning] = useState('');
  const generation = useRef(0);
  const completed = useRef(onComplete); completed.current = onComplete;
  useEffect(() => { setIndex(0); setWarning(''); }, [runKey, text]);
  useEffect(() => {
    const id = ++generation.current;
    if (!active || index >= segments.length) return;
    let settled = false;
    const timers: number[] = [];
    const synth = window.speechSynthesis;
    let speech: SpeechSynthesisUtterance | null = null;
    const start = Date.now();
    const readingMs = Math.max(2100, Math.min(12000, segments[index].length * 65 / rate));
    const valid = () => generation.current === id && !settled;
    const finish = () => {
      if (!valid()) return;
      settled = true;
      if (index + 1 < segments.length) setIndex(index + 1);
      else completed.current();
    };
    const afterReading = () => { timers.push(window.setTimeout(finish, Math.max(0, readingMs - (Date.now() - start)))); };
    const fallback = (message: string) => {
      if (!valid()) return;
      setWarning(message);
      if (speech) { speech.onend = null; speech.onerror = null; }
      synth?.cancel();
      afterReading();
    };
    if (!voice) afterReading();
    else if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') fallback('Browser speech unavailable. Subtitles continue at reading pace.');
    else {
      const available = voices.current.length ? voices.current : synth.getVoices();
      const selected = chooseVoice(available, language, voiceId);
      if (voiceId && selected?.voiceURI !== voiceId) setWarning('Your chosen voice is unavailable on this device; using an automatic fallback when possible.');
      if (language === 'ta' && !selected) fallback('No Tamil voice available. Tamil subtitles continue at reading pace.');
      else {
        synth.cancel();
        speech = new SpeechSynthesisUtterance(segments[index]);
        speech.lang = language === 'ta' ? 'ta-IN' : 'en-US';
        speech.rate = rate;
        if (selected) speech.voice = selected;
        speech.onend = () => { if (valid()) afterReading(); };
        speech.onerror = () => fallback('Narration interrupted. Subtitles continue at reading pace.');
        try { synth.speak(speech); } catch { fallback('Narration could not start. Subtitles continue at reading pace.'); }
        timers.push(window.setTimeout(() => fallback('Narration stalled. Continuing with subtitles.'), Math.max(9000, readingMs * 3)));
      }
    }
    return () => {
      generation.current++;
      settled = true;
      timers.forEach(timer => window.clearTimeout(timer));
      if (speech) { speech.onend = null; speech.onerror = null; synth?.cancel(); }
    };
  }, [active, voice, language, segments, index, runKey, rate, voiceId]);
  return { subtitle: segments[Math.min(index, segments.length - 1)], index, total: segments.length, warning };
}
