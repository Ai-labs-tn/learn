import { useEffect, useState } from 'react';

/** Browsers often populate the voice list asynchronously after getVoices(). */
export function useBrowserVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener('voiceschanged', update);
    const poll = window.setInterval(update, 500);
    const deadline = window.setTimeout(() => window.clearInterval(poll), 5000);
    return () => { synth.removeEventListener('voiceschanged', update); window.clearInterval(poll); window.clearTimeout(deadline); };
  }, []);
  return voices;
}

export function matchingVoices(voices: SpeechSynthesisVoice[], language: 'en' | 'ta') {
  return voices.filter(voice => voice.lang.toLowerCase().startsWith(language));
}
export function chooseVoice(voices: SpeechSynthesisVoice[], language: 'en' | 'ta', selected: string) {
  const candidates = matchingVoices(voices, language);
  return candidates.find(voice => voice.voiceURI === selected) ?? candidates.find(voice => /natural|neural/i.test(voice.name)) ?? candidates.find(voice => voice.default) ?? candidates[0] ?? null;
}
