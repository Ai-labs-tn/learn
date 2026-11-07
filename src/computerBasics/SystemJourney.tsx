import { useMemo } from 'react';
import { useCaptionAccess } from '../captions/CaptionAccess';
import { InlineCaptionEditor } from '../captions/InlineCaptionEditor';
import { captionText } from '../captions/model';
import { useBootCaptions } from '../captions/useBootCaptions';
import { SnapshotPlayer } from '../player/SnapshotPlayer';
import { Machine } from './Machine';
import { DesktopStartupVisual } from './DesktopStartupVisual';
import { JOURNEYS, journeyDocument, type JourneyId } from './journeys';
import s from './systemJourney.module.css';

export function SystemJourney({ id }: { id: JourneyId }) {
  const baseline = useMemo(() => journeyDocument(id), [id]);
  const { document, ready, notice } = useBootCaptions(baseline);
  const access = useCaptionAccess();
  const journey = JOURNEYS[id];
  if (!ready) return <p role="status">Loading machine story…</p>;
  const steps = journey.steps.map(step => ({ ...step, caption: captionText(document, step.id, 'en'), captionTa: captionText(document, step.id, 'ta') }));
  return <>
    {notice && <p role="status">{notice}</p>}
    <SnapshotPlayer fluid title={journey.title} steps={steps} startLabel={id === 'chrome-launch' ? '🌐 Launch Chrome' : id === 'java-machine' ? '▶ Launch Java' : '▶ Continue startup'}
      renderCaptionTools={access ? (step, language, onEditing) => <InlineCaptionEditor key={`${step.id}-${language}`} compact baseline={baseline} stepId={step.id} phase={step.phase} language={language} onEditing={onEditing} /> : undefined}
      renderCanvas={sim => {
        if (id === 'desktop-startup') return <DesktopStartupVisual scene={sim.index} playing={sim.playing} />;
        const step = sim.current;
        const transfer = step.focus === 'storage' ? 'storage-ram' : step.focus === 'firmware' ? 'firmware-cpu' : 'cpu-ram';
        return <div className={s.stage} data-focus={step.focus}>
          <Machine scene={2} focus="overview" powered event={0} failed={false} readBlock={null} onPower={() => {}} transfer={sim.playing ? transfer : undefined} />
          <section className={s.software} aria-label="Software view">
            <h3>{id === 'chrome-launch' ? 'OS process view' : 'JVM semantic view'}</h3>
            <p className={s.cpu}>{step.cpu}</p>
            <h4>RAM / virtual memory view</h4><ul>{step.memory.map(item => <li key={item}>{item}</li>)}</ul>
            {step.stack && <><h4>Thread frames</h4><ul>{step.stack.map(item => <li key={item}>{item}</li>)}</ul></>}
            {step.heap && <><h4>Shared heap objects</h4><ul>{step.heap.map(item => <li key={item}>{item}</li>)}</ul></>}
            {step.display && <div className={s.monitor}><span>▣ Display</span><p>{step.display}</p></div>}
            <small>Software overlay, not physical RAM partitions. Illustrative state and timing.</small>
          </section>
        </div>;
      }} />
  </>;
}
