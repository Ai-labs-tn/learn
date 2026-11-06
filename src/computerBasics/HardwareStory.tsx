import { Button } from '@agiler/ui';
import { useEffect, useState } from 'react';
import { useCaptionAccess } from '../captions/CaptionAccess';
import { InlineCaptionEditor } from '../captions/InlineCaptionEditor';
import { useBootCaptions } from '../captions/useBootCaptions';
import { captionText } from '../captions/model';
import { Machine } from './Machine';
import { INSPECTION, PILOT, READS, SCENES, type Part, type ReadPattern } from './story';
import s from './hardware.module.css';

export function HardwareStory() {
  const access = useCaptionAccess();
  const { document, ready, notice } = useBootCaptions(PILOT);
  const [scene, setScene] = useState(0);
  const [focus, setFocus] = useState<Part>('overview');
  const [event, setEvent] = useState(0);
  const [failure, setFailure] = useState(false);
  const [checkPassed, setCheckPassed] = useState(false);
  const [prediction, setPrediction] = useState('');
  const [powerRemoved, setPowerRemoved] = useState(false);
  const [pattern, setPattern] = useState<ReadPattern>('nearby');
  const [readAt, setReadAt] = useState(-1);
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const [editing, setEditing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechNotice, setSpeechNotice] = useState('');
  const [hidden, setHidden] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  useEffect(() => {
    const visibility = () => {
      setHidden(window.document.hidden);
      if (window.document.hidden) { window.speechSynthesis?.cancel(); setSpeaking(false); }
    };
    visibility();
    window.document.addEventListener('visibilitychange', visibility);
    return () => window.document.removeEventListener('visibilitychange', visibility);
  }, []);
  const current = SCENES[scene];
  const beat = PILOT.scenes[0].beats[scene];
  const text = captionText(document, beat.id, lang);
  const powered = scene > 0 && !powerRemoved;
  const canNext = scene > 0 && scene < 7 && (scene !== 1 || event >= 2) && (scene !== 3 || event >= 2) && (scene !== 4 || event >= 2) && (scene !== 5 || checkPassed) && (scene !== 6 || powerRemoved);
  const goto = (next: number) => {
    if (editing) return;
    window.speechSynthesis?.cancel(); setSpeaking(false); setSpeechNotice('');
    setScene(next); setFocus(SCENES[next].focus); setEvent(0); setFailure(false); setCheckPassed(false);
    setPrediction(''); setPowerRemoved(false); setReadAt(-1);
  };
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);
  const stopSpeech = () => { window.speechSynthesis?.cancel(); setSpeaking(false); };
  const narrate = () => {
    stopSpeech();
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') { setSpeechNotice('Browser speech is unavailable. All narration is available in the caption.'); return; }
    const voice = synth.getVoices().find(item => item.lang.toLowerCase().startsWith(lang));
    if (lang === 'ta' && !voice) { setSpeechNotice('No Tamil voice is available in this browser. Tamil captions remain available.'); return; }
    const speech = new SpeechSynthesisUtterance(text); speech.lang = lang === 'ta' ? 'ta-IN' : 'en-US'; if (voice) speech.voice = voice;
    speech.onend = () => setSpeaking(false); speech.onerror = () => { setSpeaking(false); setSpeechNotice('Narration stopped. Read the caption or retry.'); };
    synth.speak(speech); setSpeaking(true);
  };
  if (!ready) return <p role="status">Loading hardware story captions…</p>;
  return (
    <section className={s.story} aria-labelledby="hardware-title" data-hidden={hidden || motionPaused || editing}>
      <header className={s.header}>
        <div><p className={s.kicker}>INTERACTIVE HARDWARE PILOT</p><h2 id="hardware-title">Inside the machine</h2><p>Follow one instruction. Follow one piece of data.</p></div>
        <div className={s.controls}>
          <Button variant="outline" disabled={editing || scene === 0} onClick={() => goto(scene - 1)}>Previous scene</Button>
          <Button variant="outline" disabled={editing} onClick={() => goto(0)}>Restart hardware story</Button>
          <Button disabled={editing || !canNext} onClick={() => goto(scene + 1)}>Next scene</Button>
        </div>
      </header>
      <nav aria-label="Hardware story scenes" className={s.sceneNav}>
        {SCENES.map((item, index) => <button key={item.title} type="button" disabled={editing} aria-current={index === scene ? 'step' : undefined} onClick={() => goto(index)}>{index + 1}. {item.title}</button>)}
      </nav>
      <div className={s.heading}><h3>{current.title}</h3><span>Scene {scene + 1} of 8</span></div>
      {notice && <p role="status">{notice}</p>}
      <p className={s.question}>{current.question}</p>
      {access && <InlineCaptionEditor key={`${beat.id}-${lang}`} baseline={PILOT} stepId={beat.id} phase={current.title} language={lang} onEditing={open => { stopSpeech(); setEditing(open); }} />}
      <div className={s.caption}>
        <p>{text}</p>
        <div className={s.controls}>
          <Button size="sm" variant="outline" disabled={editing} onClick={() => { stopSpeech(); setLang(lang === 'en' ? 'ta' : 'en'); }}>Caption language: {lang === 'en' ? 'English' : 'Tamil'}</Button>
          <Button size="sm" variant="outline" disabled={editing} onClick={speaking ? stopSpeech : narrate}>{speaking ? 'Stop narration' : 'Read scene aloud'}</Button>
          <Button size="sm" variant="outline" disabled={editing} onClick={() => setMotionPaused(!motionPaused)}>{motionPaused ? 'Resume visual motion' : 'Pause visual motion'}</Button>
        </div>
        {speechNotice && <p role="status">{speechNotice}</p>}
      </div>
      <div className={s.layout}>
        <div className={s.machinePanel}>
          <div className={s.sceneState}><span>{scene === 7 ? 'INSPECTION LAB • not the boot timeline' : powered ? 'POWER ON • OS NOT LOADED' : 'POWER OFF'}</span><span>{focus === 'overview' ? 'Case open' : 'Inspection: ' + focus}</span></div>
          <Machine key={`${scene}-${focus}`} scene={scene} focus={focus} powered={powered} event={event} failed={failure} readBlock={readAt < 0 ? null : READS[pattern][readAt]} onPower={() => goto(1)} />
          {scene === 0 && <Button disabled={editing} onClick={() => goto(1)}>⏻ Press the power button</Button>}
          <div className={s.legend}><span>● Power/control</span><span>▰ Instruction fetch</span><span>↔ Working data</span></div>
          <p className={s.note}>Movement is slowed down to teach the idea. Highlights are not literal particles, exact wiring or measured timing.</p>
        </div>
        <aside className={s.inspector} aria-label="Hardware inspection and interaction">
          <h4>Inspect the connected machine</h4>
          <div className={s.controls}>
            {(['overview','cpu','ram','firmware','storage'] as const).map(part => <button className={s.inspectButton} key={part} type="button" disabled={editing} aria-pressed={focus === part} onClick={() => setFocus(part)}>{part === 'overview' ? 'Whole machine' : part === 'cpu' ? 'CPU' : part === 'ram' ? 'RAM' : part === 'storage' ? 'SSD / HDD' : 'Firmware'}</button>)}
          </div>
          <p>{INSPECTION[focus]}</p>
          <fieldset disabled={editing} className={s.experiment}>
            <legend>Try this scene</legend>
            {scene === 0 && <><p>Storage keeps your files; RAM does not retain its working state. The network connector is hardware—not a TCP port.</p><p>Press the physical power button below the case to begin.</p></>}
            {scene === 1 && <>
              <p role="status">{event === 0 ? 'Startup requested. Components are held in reset while power is prepared.' : event === 1 ? 'Supply rails stable. This is power/control activity, not Chrome travelling through a wire.' : 'Reset released. The processor can begin its startup sequence.'}</p>
              <Button disabled={event >= 2} onClick={() => setEvent(event + 1)}>{event === 0 ? 'Stabilize the supply rails' : 'Release reset'}</Button>
            </>}
            {scene === 2 && <>
              <p>Inspect the CPU cutaway. Registers sit inside a core; RAM modules sit outside the processor.</p>
              <Button variant="outline" onClick={() => setFocus('cpu')}>Inspect a core and registers</Button>
              <Button onClick={() => goto(3)}>Where does the first instruction come from?</Button>
            </>}
            {scene === 3 && <>
              <p role="status">{event === 0 ? 'Firmware instructions remain in non-volatile storage.' : event === 1 ? 'Instruction fetched: startup code reaches the processor through the platform access path.' : 'Instruction executed: startup code begins preparing the platform. The chip stores software; the CPU executes it.'}</p>
              <Button disabled={event >= 2} onClick={() => { setEvent(event + 1); setFocus(event === 0 ? 'overview' : 'cpu'); }}>{event === 0 ? 'Fetch a firmware instruction' : 'Execute the instruction'}</Button>
            </>}
            {scene === 4 && <>
              <div className={s.memoryLocation}><span>Illustrative RAM location</span><strong>{event === 0 ? 'Initialized • no example value written' : '17'}</strong></div>
              <p role="status">{event === 0 ? 'This diagram does not claim all RAM contains zeros after startup.' : event === 1 ? 'The CPU writes the example value 17 through the memory system.' : 'The value 17 is read back into a CPU register. RAM and a register are different locations.'}</p>
              <Button disabled={event >= 2} onClick={() => { setEvent(event + 1); setFocus(event === 0 ? 'ram' : 'cpu'); }}>{event === 0 ? 'Write 17 to working memory' : 'Read 17 into a register'}</Button>
            </>}
            {scene === 5 && <>
              <div className={s.controls}><Button variant="outline" onClick={() => { setFailure(true); setCheckPassed(false); setFocus('ram'); }}>Try a memory-check failure</Button><Button onClick={() => { setFailure(false); setCheckPassed(true); }}>Run passing checks</Button></div>
              <p role="status">{failure ? 'Memory check failed. Startup stops in this illustration. Retry passing checks to continue; no real hardware was changed.' : checkPassed ? 'Selected checks passed. This is not a certificate that every component is fault-free. The OS has not loaded yet.' : 'Choose a branch. POST scope and order depend on the machine.'}</p>
            </>}
            {scene === 6 && <>
              <div className={s.controls}><Button variant="outline" onClick={() => setPrediction('ram')}>RAM working value remains</Button><Button variant="outline" onClick={() => setPrediction('storage')}>Saved file on storage remains</Button></div>
              {prediction && <p role="status">{prediction === 'storage' ? 'Correct: storage retains the saved file across a normal power cycle.' : 'Not reliably: volatile RAM loses its working state without power. Try the storage answer.'}</p>}
              <Button disabled={prediction !== 'storage' || powerRemoved} onClick={() => setPowerRemoved(true)}>Remove simulated power</Button>
              {powerRemoved && <p className={s.answer}>RAM example value: not retained. Saved file on SSD/HDD: retained.</p>}
            </>}
            {scene === 7 && <>
              <p>This separate inspection lab compares read mechanisms, not a timed startup benchmark.</p>
              <div className={s.controls}>{(['nearby','scattered'] as const).map(value => <button className={s.inspectButton} key={value} type="button" aria-pressed={pattern === value} onClick={() => { setPattern(value); setReadAt(-1); }}>{value === 'nearby' ? 'Nearby reads' : 'Scattered reads'}</button>)}</div>
              <p>Illustrative requests: {READS[pattern].join(' → ')}. These positions are not literal mappings of logical blocks onto disk geometry.</p>
              <Button onClick={() => { setReadAt((readAt + 1) % 4); setFocus('storage'); }}>Read next example block</Button>
              <p role="status">{readAt < 0 ? 'Choose a pattern, then issue a read.' : `Request ${readAt + 1}: block ${READS[pattern][readAt]}. HDD: ${pattern === 'scattered' ? 'larger head repositioning may be needed' : 'targets are nearby, reducing repositioning'}. SSD: controller addresses flash; there is no moving read head.`}</p>
              <p>Flash access is not instantaneous. Controllers, caches, interfaces and workloads all affect performance; no speed numbers here are benchmarks.</p>
              <h4>Next question</h4><p>How do CPU, RAM and storage cooperate when you open Chrome? That is the next slice—not part of this pilot.</p>
            </>}
          </fieldset>
        </aside>
      </div>
      <footer className={s.boundary}><strong>Teaching boundary:</strong> simplified PC internals. Firmware is software; CPU and processor refer to the same part. TCP ports are logical software endpoints, not the physical network connector. Chrome, networking and the JVM are deliberately reserved for later slices.</footer>
    </section>
  );
}
