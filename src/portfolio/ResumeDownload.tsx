import { useEffect, useId, useRef, useState } from 'react';
import type { Profile } from './types';
import s from './portfolio.module.css';

type Format = 'docx' | 'pdf';
const LABEL: Record<Format, string> = { docx: 'Word document (.docx)', pdf: 'PDF document (.pdf)' };

/**
 * Builds the resume in the browser from the profile that is already on the page, so it always matches
 * what is shown. The generator is loaded only on click; nothing is uploaded or stored anywhere.
 */
export function ResumeDownload({ profile, variant = 'secondary' }: { profile: Profile; variant?: 'primary' | 'secondary' }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const download = async (format: Format) => {
    setBusy(format); setFailed(false); setStatus(`Preparing your ${format.toUpperCase()} resume…`);
    try {
      const { generateResume } = await import('../resume');
      const result = await generateResume(profile, format);
      const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: result.mime }));
      const link = document.createElement('a');
      link.href = url; link.download = result.filename; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus(`Downloaded ${result.filename} (${result.pages} pages).`);
      setOpen(false);
    } catch {
      setFailed(true);
      setStatus('The resume could not be created. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={root} className={s.resumeMenu}>
      <button ref={trigger} type="button" className={variant === 'primary' ? s.cta : s.ctaAlt} aria-expanded={open} aria-controls={`${id}-formats`}
        disabled={busy !== null} onClick={() => setOpen((value) => !value)}>
        {busy ? 'Preparing…' : 'Download resume'}<span className={s.menuCaret} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-formats`} role="group" aria-label="Resume format" className={s.resumeOptions}>
          {(Object.keys(LABEL) as Format[]).map((format) => (
            <button key={format} type="button" className={s.resumeOption} disabled={busy !== null} onClick={() => void download(format)}>
              {LABEL[format]}
            </button>
          ))}
        </div>
      )}
      <p className={s.srOnly} aria-live="polite" data-resume-status>{failed ? '' : status}</p>
      {failed && <p className={s.resumeError} role="alert">{status}</p>}
    </div>
  );
}
