import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { normalizeEnvelope, type Profile } from '../../src/portfolio/types';
import { generateResume, planResume, resumeFilename } from '../../src/resume';
import { dedupeHighlights, sanitize, SECTION_HEADINGS } from '../../src/resume/model';
import { THEME } from '../../src/resume/theme';

const snapshot = () => normalizeEnvelope(JSON.parse(readFileSync('src/portfolio/profile.snapshot.json', 'utf8')))!.profile;
const withPhone = (p: Profile): Profile => ({ ...p, contact: { ...p.contact, phone: '+91 98765 43210' } });
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

async function pdfText(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 }).promise;
  const pages: { text: string; minY: number; maxY: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    const items = c.items.filter((x: any) => 'str' in x && x.str.trim()) as any[];
    pages.push({
      text: items.map((x) => x.str).join(' '),
      minY: Math.min(...items.map((x) => x.transform[5])),
      maxY: Math.max(...items.map((x) => x.transform[5])),
    });
  }
  return { numPages: doc.numPages, pages, text: squash(pages.map((p) => p.text).join(' ')) };
}
async function docxParts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
    [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((t) => (t[1] ?? ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join(''));
  return { zip, xml, text: squash(paras.join(' ')), names: Object.keys(zip.files) };
}
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const inOrder = (text: string, items: string[]) => {
  let at = -1;
  for (const it of items) { const i = text.indexOf(it, at + 1); expect(i, it).toBeGreaterThan(at); at = i; }
};
function stress(p: Profile): Profile {
  const dup = <T,>(xs: T[], f: (x: T, i: number) => T) => [...xs, ...xs.map(f)];
  return {
    ...p,
    projects: dup(p.projects, (x, i) => ({ ...x, id: `${x.id}-b`, name: `${x.name} Phase ${i + 2}` })),
    awards: dup(p.awards, (x, i) => ({ ...x, title: `${x.title} Plus ${i}` })),
    skills: dup(p.skills, (x, i) => ({ ...x, name: `${x.name} ${i}` })),
  };
}

for (const [label, make] of [['real snapshot', snapshot], ['synthetic with phone', () => withPhone(snapshot())]] as const) {
  test(`both formats generate and agree: ${label}`, async () => {
    const p = make();
    const hasPhone = !!p.contact.phone;
    const plan = planResume(p);
    const pdf = await generateResume(p, 'pdf');
    const docx = await generateResume(p, 'docx');
    expect(pdf.filename).toBe('Saravanamanikandan_S_Resume.pdf');
    expect(docx.filename).toBe('Saravanamanikandan_S_Resume.docx');
    expect(pdf.mime).toBe('application/pdf');

    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(2);
    const t = await pdfText(pdf.bytes);
    expect(t.numPages).toBe(2);
    const fill = (t.pages[1].maxY === undefined ? 0 : (THEME.page.height - THEME.margin - t.pages[1].minY) / (THEME.page.height - 2 * THEME.margin));
    expect(fill).toBeGreaterThanOrEqual(0.45);
    expect(plan.lastPageFill).toBeGreaterThanOrEqual(0.45);
    expect(plan.docxPages).toBeLessThanOrEqual(2);
    expect(plan.pages).toBe(2);

    const d = await docxParts(docx.bytes);
    for (const text of [t.text, d.text]) {
      expect(text).toContain(p.identity.name);
      inOrder(text, SECTION_HEADINGS.map((h) => h));
      expect(text).toContain(p.contact.email);
      expect(text).toContain(p.contact.linkedin);
      if (hasPhone) expect(text).toContain(p.contact.phone!); else expect(text).not.toMatch(/\+?\d[\d ()-]{8,}\d/);
      for (const e of p.experience) { expect(text).toContain(e.company); expect(text).toContain(e.role); }
      for (const c of p.certifications) expect(text).toContain(c.name);
      expect(text).toContain(p.education[0].institution);
      for (const a of p.awards.filter((x) => !/Google Cloud Certified/.test(x.title))) expect(text).toContain(sanitize(a.title));
      expect(text).toContain('Domain expertise:');
      expect(text).toContain('May 2021 \u2013 Present');
    }
    if (plan.tier.maxProjects >= p.projects.length) for (const pr of p.projects) { expect(t.text).toContain(pr.name); expect(d.text).toContain(pr.name); }
    for (const c of p.certifications) {
      expect(t.text.split(c.name).length - 1).toBe(1);
      expect(d.text.split(c.name).length - 1).toBe(1);
    }
    const strip = (s: string) => s.replace(/\u2022/g, ' ');
    expect([...words(strip(t.text))].sort()).toEqual([...words(d.text)].sort());

    // ATS structure
    expect(d.xml).not.toMatch(/<w:tbl[ >]/);
    expect(d.xml).not.toContain('<w:drawing');
    expect(d.xml).not.toContain('<w:pict');
    expect(d.xml).not.toContain('<w:txbxContent');
    expect(d.names.filter((n) => /(header|footer)\d*\.xml$/.test(n))).toEqual([]);
    expect(d.xml).toContain('Arial');
    expect(d.xml).toContain('<w:numPr>');
    expect(d.xml).toContain('<w:hyperlink');
    expect(await d.zip.file('word/numbering.xml')!.async('string')).toContain('w:val="bullet"');
    const core = await d.zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('Saravanamanikandan S \u2013 Resume'.replace('Saravanamanikandan S', p.identity.name));
    expect(core).toContain(p.identity.name);
    expect(await d.zip.file('word/styles.xml')!.async('string')).toContain('en-US');

    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getTitle()).toBe(`${p.identity.name} \u2013 Resume`);
    expect(doc.getAuthor()).toBe(p.identity.name);
    expect(doc.getKeywords()).toBeTruthy();
    expect(t.text).toContain('\u2022');
    expect(t.text).not.toMatch(/\b\w \w \w \w\b/);
  });
}

test('PDF has clickable email and LinkedIn links', async () => {
  const pdf = await generateResume(snapshot(), 'pdf');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.bytes), verbosity: 0 }).promise;
  const links = (await (await doc.getPage(1)).getAnnotations()).filter((a: any) => a.subtype === 'Link').map((a: any) => a.url as string);
  expect(links.some((u) => u.startsWith('mailto:'))).toBe(true);
  expect(links.some((u) => u.startsWith('https://') && u.includes('linkedin'))).toBe(true);
});

test('no address, references or reference phone ever appear', async () => {
  const p: any = withPhone(snapshot());
  p.contact.address = '42 Secret Lane, Hiddenville';
  p.address = '42 Secret Lane, Hiddenville';
  p.references = [{ name: 'Zebediah Referee', phone: '+1 555 0100 777', email: 'ref@example.org' }];
  p.narration = { about: 'NARRATION-ONLY-TEXT-QZX', tagline: 'NARRATION-TAGLINE-QZX' };
  for (const f of ['pdf', 'docx'] as const) {
    const r = await generateResume(p, f);
    const text = f === 'pdf' ? (await pdfText(r.bytes)).text : (await docxParts(r.bytes)).text;
    for (const bad of ['Secret Lane', 'Hiddenville', 'Zebediah', '555 0100', 'ref@example.org', 'QZX']) expect(text).not.toContain(bad);
  }
});

test('stress profile falls back to a more compact tier and stays within 2 pages', async () => {
  const base = planResume(snapshot());
  const s = stress(snapshot());
  const plan = planResume(s);
  expect(plan.tier.index).toBeGreaterThan(base.tier.index);
  const pdf = await generateResume(s, 'pdf');
  expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeLessThanOrEqual(2);
  expect(plan.docxPages).toBeLessThanOrEqual(2);
  const docx = await generateResume(s, 'docx');
  expect(docx.pages).toBeLessThanOrEqual(2);
  const extreme = stress(stress(stress(snapshot())));
  expect(planResume(extreme).pages).toBeLessThanOrEqual(2);
});

test('tiny profile still works', async () => {
  const tiny: Profile = {
    identity: { name: 'Ada Lovelace', headline: 'Engineer', titles: ['Engineer'], region: 'London' },
    contact: { email: 'ada@example.org', linkedin: 'linkedin.com/in/ada' },
    summary: 'Writes programs.', highlights: [], skills: [], certifications: [], awards: [], projects: [], domains: [],
    experience: [{ id: 'e', role: 'Analyst', company: 'Engine Co', location: 'London', start: '2020-01', end: '2021-02' }],
    education: [],
  };
  const plan = planResume(tiny);
  expect(plan.tier.index).toBe(0);
  expect(plan.pages).toBe(1);
  for (const f of ['pdf', 'docx'] as const) {
    const r = await generateResume(tiny, f);
    expect(r.bytes.length).toBeGreaterThan(500);
  }
  const t = await pdfText((await generateResume(tiny, 'pdf')).bytes);
  expect(t.text).toContain('Analyst \u2014 Engine Co, London');
  expect(t.text).toContain('Jan 2020 \u2013 Feb 2021');
});

test('special characters are sanitised and never throw', async () => {
  const p = snapshot();
  const odd: Profile = {
    ...p,
    identity: { ...p.identity, name: 'சரவணன் Jos\u00E9 \u201CQ\u201D \u{1F600} Muller' },
    projects: [{ ...p.projects[0], name: 'Pro\u00FDect \u0BA4\u0BAE\u0BBF\u0BB4\u0BCD \u{1F680} X', summary: 'It\u2019s \u201Cgood\u201D \u2014 really \u2713.' }, ...p.projects.slice(1)],
  };
  expect(sanitize('Caf\u00E9 \u201Cx\u201D \u2019 \u{1F600} \u0BA4')).toBe('Cafe "x" ' + "'");
  for (const f of ['pdf', 'docx'] as const) {
    const r = await generateResume(odd, f);
    expect(r.bytes.length).toBeGreaterThan(500);
  }
  expect(resumeFilename(odd, 'pdf')).toMatch(/^[A-Za-z0-9_]+_Resume\.pdf$/);
  const t = await pdfText((await generateResume(odd, 'pdf')).bytes);
  expect(t.text).toContain('Jose "Q" Muller');
  expect(t.text).toContain("It's \"good\"");
});

test('dedupe: highlights vs summary and each other', () => {
  const summary = 'Full-stack developer with 11+ years of experience in Java and Angular, leading AGILE teams.';
  const out = dedupeHighlights([
    'Full-stack developer with 11+ years of experience in Java and Angular',
    'Technical lead for an 8 member AGILE team.',
    'technical lead for an 8-member agile team',
    'Led the migration of Kinetica to BigQuery on GCP.',
    'Led migration of Kinetica to BigQuery on GCP',
  ], summary);
  expect(out).toEqual(['Technical lead for an 8 member AGILE team.', 'Led the migration of Kinetica to BigQuery on GCP.']);
});

test('google cloud certification is shown once, under Certifications only', async () => {
  const p = snapshot();
  const withAward: Profile = { ...p, awards: [...p.awards, { title: 'Google Cloud Certified Professional Cloud Architect', date: '2022-01-01', description: 'Passed.' }] };
  const t = (await pdfText((await generateResume(withAward, 'pdf')).bytes)).text;
  expect(t.split('Google Cloud Certified Professional Cloud Architect').length - 1).toBe(1);
});

