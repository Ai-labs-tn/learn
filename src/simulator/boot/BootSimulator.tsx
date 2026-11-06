import { Whiteboard } from '../whiteboard/Whiteboard';
import { BOOT_TIMELINE } from './bootTimeline';
import { useCaptionAccess } from '../../captions/CaptionAccess';
import { InlineCaptionEditor } from '../../captions/InlineCaptionEditor';
import { useBootCaptions } from '../../captions/useBootCaptions';
import { captionText } from '../../captions/model';
import { BootMachine, focusAnchorOf } from './BootMachine';

/** Keep the machine snapshots separate from the versioned, bilingual teaching text. */
export function BootSimulator() {
  const access = useCaptionAccess();
  const { document, ready, notice } = useBootCaptions();
  if (!ready) return <p role="status">Loading boot captions…</p>;
  return (
    <>
      {notice && <p role="status">{notice}</p>}
      <Whiteboard
        title="How a computer boots"
        steps={BOOT_TIMELINE.map(step => ({
          ...step,
          caption: captionText(document, step.id, 'en'),
          captionTa: captionText(document, step.id, 'ta'),
        }))}
        renderCaptionTools={access ? (step, language, onEditing) => (
          <InlineCaptionEditor
            key={`${step.id}-${language}`}
            stepId={step.id}
            phase={step.phase}
            language={language}
            onEditing={onEditing}
          />
        ) : undefined}
        anchorFor={sim => focusAnchorOf(sim.current)}
        renderCanvas={sim => <BootMachine step={sim.current} index={sim.index} onJump={sim.jumpTo} />}
      />
    </>
  );
}
