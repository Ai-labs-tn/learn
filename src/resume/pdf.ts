import type { Profile } from '../portfolio/types';
import type { ResumePlan } from './layout';
import { sanitize } from './model';
import { THEME } from './theme';
import { docTitle, hexRgb, topSkills } from './util';

export async function renderPdf(profile: Profile, plan: ResumePlan): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = sanitize(profile.identity.name);
  pdf.setTitle(docTitle(profile));
  pdf.setAuthor(name);
  pdf.setSubject(`Resume of ${name}${profile.identity.headline ? ` - ${sanitize(profile.identity.headline)}` : ''}`);
  pdf.setKeywords(topSkills(profile));
  pdf.setCreator('Portfolio resume generator');
  pdf.setProducer('pdf-lib');
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));

  const { width: PW, height: PH } = THEME.page;
  const M = THEME.margin;
  const pages = Array.from({ length: Math.max(1, plan.pages) }, () => pdf.addPage([PW, PH]));
  const col = (hex: string) => { const [r, g, b] = hexRgb(hex); return rgb(r, g, b); };
  for (const l of plan.lines) {
    const page = pages[l.page];
    const base = PH - M - l.top - l.size * 0.95;
    const isHead = l.kind === 'heading', isName = l.kind === 'name';
    const color = col(isHead || isName ? THEME.color.accent : THEME.color.text);
    const total = l.segs.reduce((a, s) => a + s.w, 0);
    const x0 = M + l.indent + (l.center ? (l.width - total) / 2 : 0);
    if (l.bullet) page.drawText('\u2022', { x: M + THEME.bulletIndent, y: base, size: l.size, font: reg, color: col(THEME.color.text) });
    for (const s of l.segs) {
      if (!s.text) continue;
      const x = x0 + s.x;
      page.drawText(s.text, { x, y: base, size: l.size, font: s.bold ? bold : reg, color });
      if (s.href) {
        const ref = pdf.context.register(pdf.context.obj({
          Type: 'Annot', Subtype: 'Link', Rect: [x, base - 2, x + s.w, base + l.size], Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(s.href) },
        }));
        page.node.addAnnot(ref);
      }
    }
    if (l.date) {
      const w = l.dateW ?? 0;
      page.drawText(l.date, { x: M + l.width - w, y: base, size: l.size, font: reg, color: col(THEME.color.muted) });
    }
    if (l.rule) {
      page.drawLine({ start: { x: M, y: base - 3 }, end: { x: M + l.width, y: base - 3 }, thickness: 0.6, color: col(THEME.color.accent) });
    }
  }
  return pdf.save();
}
