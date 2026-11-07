import { useEffect, useRef, useState } from 'react';
import { chooseVoice, matchingVoices, useBrowserVoices } from './useBrowserVoices';
import type { PlayerController } from './usePlayerController';

/** The sample is spoken only after a user gesture; it never calls the app backend. */
export function VoiceSettings({ controller: c }: { controller: PlayerController }) {
  const voices = useBrowserVoices();
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const started = useRef(false);
  const watchdog = useRef<number>();
  const language = c.preferences.language;
  const selected = language === 'ta' ? c.preferences.voiceTa : c.preferences.voiceEn;
  const options = matchingVoices(voices, language);
  const stop = () => {
    generation.current++;
    window.clearTimeout(watchdog.current);
    if (started.current) window.speechSynthesis?.cancel();
    started.current = false; setPreviewing(false);
  };
  useEffect(() => {
    // Changing language or speed cancels an in-flight sample, never the main player.
    if (started.current) { generation.current++; window.clearTimeout(watchdog.current); window.speechSynthesis?.cancel(); started.current = false; setPreviewing(false); }
  }, [language, c.preferences.rate]);
  useEffect(() => () => { generation.current++; window.clearTimeout(watchdog.current); if (started.current) window.speechSynthesis?.cancel(); }, []);
  const preview = () => {
    stop(); setMessage('');
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') { setMessage('Browser speech is unavailable.'); return; }
    const voice = chooseVoice(synth.getVoices(), language, selected);
    if (language === 'ta' && !voice) { setMessage('No Tamil voice is available. Tamil subtitles still work.'); return; }
    if (selected && voice?.voiceURI !== selected) setMessage('Your selected voice is unavailable here; previewing another available voice.');
    const speech = new SpeechSynthesisUtterance(language === 'ta'
      ? 'Power பொத்தானை அழுத்துங்கள். கணினியின் உள்ளே என்ன நடக்கிறது என்று ஒன்றாகப் பார்ப்போம்.'
      : 'Press the power button. Now, let us follow what happens inside the machine.');
    speech.lang = language === 'ta' ? 'ta-IN' : 'en-US';
    speech.rate = c.preferences.rate;
    if (voice) speech.voice = voice;
    const id = ++generation.current;
    speech.onend = () => { if (generation.current === id) { window.clearTimeout(watchdog.current); started.current = false; setPreviewing(false); } };
    speech.onerror = () => { if (generation.current === id) { window.clearTimeout(watchdog.current); started.current = false; setPreviewing(false); setMessage('The browser could not play this voice. Try another voice.'); } };
    try { started.current = true; setPreviewing(true); synth.speak(speech); watchdog.current = window.setTimeout(() => { if (generation.current === id && started.current) { stop(); setMessage('Voice sample timed out. Try another voice.'); } }, 20000); }
    catch { started.current = false; setPreviewing(false); setMessage('The browser could not play this voice. Try another voice.'); }
  };
  return <>
    <label>Browser voice<select aria-label="Browser voice" value={selected} onChange={event => {
      stop(); setMessage(''); c.updatePreferences(language === 'ta' ? { voiceTa: event.target.value } : { voiceEn: event.target.value });
    }}>
      <option value="">Automatic selection</option>
      {selected && !options.some(voice => voice.voiceURI === selected) && <option value={selected}>Previously selected voice unavailable</option>}
      {options.map(voice => <option key={`${voice.voiceURI}-${voice.lang}`} value={voice.voiceURI}>{voice.name} ({voice.lang}){voice.localService ? ' — browser reports local' : ' — may use a network service'}</option>)}
    </select></label>
    <button type="button" onClick={previewing ? stop : preview}>{previewing ? 'Stop voice sample' : 'Play voice sample'}</button>
    {message && <p role="status">{message}</p>}
    <p>Voice availability and quality depend on your browser and device. Some voices may send text to a browser or operating-system service; consult its privacy settings. No new app-side audio provider is used.</p>
  </>;
}
