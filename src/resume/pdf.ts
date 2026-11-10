import type { Profile } from '../portfolio/types';
import { baselineOffset, ruleWidthPt, textWidth, titleRuleSpace, type ResumePlan } from './layout';
import { footerSz, looks, page, tw2pt } from './look';
import { sanitize, supported } from './model';
import { SPEC } from './template/spec';
import { b64ToBytes, docTitle, hexRgb, topSkills } from './util';

const drawable = (t: string) => [...t].map((c) => (supported(c) ? c : '?')).join('');

export async function renderPdf(profile: Profile, plan: ResumePlan): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString, rgb, setCharacterSqueeze } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const { CALADEA_REGULAR_B64, CALADEA_BOLD_B64 } = await import('./fonts/fonts');
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const opts = { subset: true, features: { liga: false, kern: false, clig: false } };
  const reg = await pdf.embedFont(b64ToBytes(CALADEA_REGULAR_B64), opts);
  const bold = await pdf.embedFont(b64ToBytes(CALADEA_BOLD_B64), opts);
  const name = sanitize(profile.identity.name);
  pdf.setTitle(docTitle(profile));
  pdf.setAuthor(name);
  pdf.setSubject(`Resume of ${name}${profile.identity.headline ? ` - ${sanitize(profile.identity.headline)}` : ''}`);
  pdf.setKeywords(topSkills(profile));
  pdf.setCreator('Portfolio resume generator');
  pdf.setProducer('pdf-lib');
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'));

  const P = page();
  const L = looks(plan.tier);
  const pages = Array.from({ length: Math.max(1, plan.pages) }, () => pdf.addPage([P.width, P.height]));
  const col = (hex: string) => { const [r, g, b] = hexRgb(hex); return rgb(r, g, b); };
  const colorOf = (id: string) => (id === 'Title' || id === 'Heading1' ? SPEC.colors.heading : id === 'Heading2' ? SPEC.colors.heading2 : SPEC.colors.body);
  // Caladea's lowercase is ~5% narrower than Cambria's; stretch each run to the Cambria width Word (and the plan) uses.
  const put = (pg: (typeof pages)[number], text: string, x: number, y: number, size: number, f: typeof reg, color: ReturnType<typeof col>, width: number) => {
    const t = drawable(text);
    const natural = f.widthOfTextAtSize(t, size);
    pg.pushOperators(setCharacterSqueeze(natural > 0 && width / natural > 0.85 && width / natural < 1.2 ? (width / natural) * 100 : 100));
    pg.drawText(t, { x, y, size, font: f, color });
    pg.pushOperators(setCharacterSqueeze(100));
  };
  const linkColor = col(SPEC.styles.Hyperlink.color);

  for (const l of plan.lines) {
    const pg = pages[l.page];
    const base = P.height - P.top - l.top - baselineOffset(l.size);
    const caps = l.look.caps;
    const x0 = P.left + l.indent;
    if (l.bullet) put(pg, SPEC.bullet.char, P.left + l.size * 0.075, base, l.size, reg, col(SPEC.styles.ListBullet.color), textWidth(SPEC.bullet.char, false, l.size));
    for (const s of l.segs) {
      const x = x0 + s.x;
      const color = s.href ? linkColor : col(colorOf(l.style));
      put(pg, s.text, x, base, l.size, s.bold ? bold : reg, color, s.w);
      if (s.href) {
        pg.drawLine({ start: { x, y: base - l.size * 0.1 }, end: { x: x + s.w, y: base - l.size * 0.1 }, thickness: l.size * 0.05, color: linkColor });
        const ref = pdf.context.register(pdf.context.obj({
          Type: 'Annot', Subtype: 'Link', Rect: [x, base - l.size * 0.25, x + s.w, base + l.size * 0.8], Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(s.href) },
        }));
        pg.node.addAnnot(ref);
      }
    }
    if (l.style === 'Title') {
      const th = ruleWidthPt();
      const space = titleRuleSpace(L.Title);
      const y = P.height - P.top - l.top - l.lh - space - th / 2;
      pg.drawLine({ start: { x: P.left, y }, end: { x: P.width - P.right, y }, thickness: th, color: col(SPEC.rule.color) });
    }
  }
  const fsz = footerSz(plan.tier) / 2;
  pages.forEach((pg, i) => {
    if (i === 0 && SPEC.footer.firstPageBlank) return;
    const t = `${SPEC.footer.text} ${i + 1}`;
    const w = textWidth(t, false, fsz);
    put(pg, t, P.width - P.right - w, tw2pt(SPEC.page.footer) + fsz * 0.2217, fsz, reg, col(SPEC.footer.color), w);
  });
  return pdf.save();
}

