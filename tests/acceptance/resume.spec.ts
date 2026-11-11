import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { normalizeEnvelope, type Profile } from '../../src/portfolio/types';
import { generateResume, planResume, resumeFilename } from '../../src/resume';
import { buildBlocks, dedupeHighlights, firstSentence, fmtDate, sanitize, SECTION_HEADINGS, tierAt, TIER_COUNT, whole } from '../../src/resume/model';
import { looks } from '../../src/resume/look';
import { SPEC } from '../../src/resume/template/spec';

const load = (path: string) => normalizeEnvelope(JSON.parse(readFileSync(path, 'utf8')))!.profile;
// Frozen copy of the owner's resume, so editing resume.md can never break these tests; 'published' follows the live snapshot.
const snapshot = () => load('tests/fixtures/resume-frozen.json');
const fixture = () => load('tests/fixtures/resume-v2-draft.json');
const published = () => load('src/portfolio/profile.snapshot.json');
const withPhone = (p: Profile): Profile => ({ ...p, contact: { ...p.contact, phone: '+91 98765 43210' } });
const withExtras = (p: Profile): Profile => ({ ...p, contact: { ...p.contact, website: 'https://example.org/portfolio' }, interests: ['Open-source gardening', 'Trail running', 'Chess endgames'] });
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const flat = (s: string) => s.toLowerCase().replace(/\s+/g, '');

async function pdfText(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push((c.items as any[]).filter((x) => 'str' in x && x.str.trim()).map((x) => x.str).join(' '));
  }
  return { numPages: doc.numPages, text: squash(pages.join(' ')) };
}
async function docxParts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
    [...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join(''));
  const read = async (p: string) => zip.file(p)!.async('string');
  return { zip, xml, text: squash(paras.join(' ')), names: Object.keys(zip.files), read };
}
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const inOrder = (text: string, items: readonly string[]) => {
  const t = text.toLowerCase();
  let at = -1;
  for (const it of items) { const i = t.indexOf(it.toLowerCase(), at + 1); expect(i, it).toBeGreaterThan(at); at = i; }
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

// strict: must fit exactly the preferred 2 pages. Other data may legitimately grow (the policy allows up to 4).
const textOf = (b: { runs: { text: string }[] }) => b.runs.map((r) => r.text).join('');
const noMarks = (s: string) => s.replace(/\*\*/g, '');

const CASES: [string, () => Profile][] = [
  ['real snapshot', snapshot],
  ['owner fixture v2', fixture],
  ['synthetic with extras', () => withExtras(withPhone(snapshot()))],
];

for (const [label, make] of CASES) {
  test(`both formats are built from the template at native sizes and agree: ${label}`, async () => {
    const p = make();
    const plan = planResume(p);
    const pdf = await generateResume(p, 'pdf');
    const docx = await generateResume(p, 'docx');
    expect(pdf.filename).toBe('Saravanamanikandan_S_Resume.pdf');
    expect(docx.filename).toBe('Saravanamanikandan_S_Resume.docx');
    expect(pdf.mime).toBe('application/pdf');

    expect(plan.fits).toBe(true);
    expect(plan.maxPages).toBeLessThanOrEqual(4);
    expect(plan.pages).toBeLessThanOrEqual(plan.maxPages);
    expect(plan.docxPages).toBeLessThanOrEqual(plan.maxPages);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(plan.pages);
    const t = await pdfText(pdf.bytes);
    expect(t.numPages).toBe(plan.pages);
    expect(docx.pages).toBe(plan.docxPages);

    const d = await docxParts(docx.bytes);
    const blocks = plan.blocks;
    const entries = blocks.filter((b) => b.style === 'Heading2').length;
    for (const text of [t.text, d.text]) {
      expect(text).not.toContain('**');
      expect(text).toContain(p.identity.name);
      inOrder(text, SECTION_HEADINGS.filter((h) => blocks.some((b) => b.style === 'Heading1' && textOf(b) === h)));
      expect(text).toContain(p.contact.email);
      expect(flat(text)).toContain(flat(`LinkedIn: ${p.contact.linkedin.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}`));
      if (p.contact.website) expect(flat(text)).toContain(flat(`Website: ${p.contact.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}`));
      if (p.contact.phone) expect(text).toContain(p.contact.phone); else expect(text).not.toMatch(/\+?\d[\d ()-]{8,}\d/);
      if (p.contact.address) expect(flat(text)).toContain(flat(p.contact.address));
      for (const e of p.experience) {
        expect(text.toLowerCase()).toContain(`${e.role} | ${e.company} | `.toLowerCase());
        for (const a of e.achievements) expect(flat(text).split(flat(noMarks(a))).length - 1, a).toBe(1);
      }
      for (const c of p.certifications) expect(text.split(c.name).length - 1, c.name).toBe(1);
      expect(text.toLowerCase()).toContain(p.education[0].institution.toLowerCase());
      for (const i of p.interests) expect(text).toContain(i);
      if (p.skillFocus?.primary.length) { expect(text).toContain(`Primary: ${p.skillFocus.primary.join(', ')}`); expect(text).toContain(`Secondary: ${p.skillFocus.secondary.join(', ')}`); }
      expect(text).toContain('Domain expertise:');
    }
    // every award once (title, date and description), none dropped by dedupe
    if (plan.tier.maxAwards >= p.awards.length) {
      for (const text of [t.text, d.text]) {
        for (const a of p.awards) {
          const head = a.date ? `${sanitize(a.title)} (${fmtDate(a.date)})` : sanitize(a.title);
          const line = flat(`${head} \u2013 ${noMarks(sanitize(a.description))}`);
          expect(flat(text).split(line).length - 1, head).toBe(1);
        }
      }
    }
    const strip = (s: string) => s.replace(/\bPage \d+\b/g, ' ').replace(/[\u00B7\u2022]/g, ' ');
    expect([...words(strip(t.text))].sort()).toEqual([...words(d.text)].sort());
    expect(t.text).not.toMatch(/\b\w \w \w \w\b/);

    // DOCX is genuinely the owner's template, sizes untouched, formatting from styles only
    expect(d.xml).not.toMatch(/<w:tbl[ >]/);
    expect(d.xml).not.toContain('<w:drawing');
    expect(d.xml).not.toContain('<w:pict');
    expect(d.xml).not.toContain('<w:txbxContent');
    expect(d.xml).not.toMatch(/May Riley|Contoso|Bigtown/);
    expect(d.xml).not.toMatch(/<w:sz /);
    expect(d.xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(d.xml).toMatch(/<w:pgMar w:top="1008" w:right="1152" w:bottom="864" w:left="1152" w:header="288" w:footer="144"/);
    expect(d.xml.match(/w:val="Heading2"/g)?.length).toBe(entries);
    for (const s of ['Title', 'Contact', 'Heading1', 'ListBullet']) expect(d.xml).toContain(`w:val="${s}"`);
    expect(d.xml).toMatch(/<w:pBdr><w:bottom w:val="single" w:sz="12" [^>]*w:color="39A5B7"/);
    expect(d.names.filter((n) => /^(customXml|docMetadata)\//.test(n) || n === 'docProps/custom.xml')).toEqual([]);
    expect(d.names.some((n) => /^word\/footer\d*\.xml$/.test(n))).toBe(true);
    expect(d.names.filter((n) => /header\d*\.xml$/.test(n))).toEqual([]);
    const styles = await d.read('word/styles.xml');
    const block = (id: string) => new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(styles)![0];
    expect(block('Title')).toContain('<w:sz w:val="56"');
    expect(block('Heading1')).toContain('<w:sz w:val="28"');
    expect(block('Heading2')).toContain('<w:sz w:val="28"');
    expect(block('Heading2')).toContain('2A7B88');
    expect(block('Heading2')).toContain('<w:b ');
    expect(block('Heading2')).not.toContain('caps');
    expect(block('Contact')).toContain('<w:sz w:val="20"');
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="22"/);
    expect(await d.read('word/theme/theme11.xml')).toContain('39A5B7');
    expect(await d.read('word/theme/theme11.xml')).toContain('typeface="Cambria"');
    const numbering = await d.read('word/numbering.xml');
    expect(numbering).toContain('w:val="bullet"');
    expect(numbering).toContain('w:numId="21"');
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels']) expect(await d.read(f)).not.toMatch(/customXml|docMetadata|custom-properties|custom\.xml/);
    const rels = await d.read('word/_rels/document.xml.rels');
    expect(rels).toContain('Target="mailto:');
    expect(rels).toMatch(/Target="https:\/\/[^"]*linkedin[^"]*" TargetMode="External"/);
    if (p.contact.website) expect(rels).toContain(`Target="${p.contact.website}"`);
    expect(d.xml).toContain('<w:hyperlink');
    expect(d.xml).toContain('w:val="Hyperlink"');
    expect(await d.read('word/footer11.xml')).toContain('PAGE');
    expect(d.xml).toContain('<w:titlePg');
    const core = await d.read('docProps/core.xml');
    expect(core).toContain(`<dc:title>${p.identity.name} \u2013 Resume</dc:title>`);
    expect(core).not.toMatch(/Riley|Microsoft Corporation/);

    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getTitle()).toBe(`${p.identity.name} \u2013 Resume`);
    expect(doc.getAuthor()).toBe(p.identity.name);
  });
}

test('the owner fixture keeps its full content on up to 4 pages at native sizes; no level scales fonts or spacing', async () => {
  const p = fixture();
  const plan = planResume(p);
  expect(plan.tier.index).toBe(0);                       // richest level: nothing is trimmed to save a page
  expect(plan.pages).toBeGreaterThanOrEqual(3);
  expect(plan.pages).toBeLessThanOrEqual(4);
  expect(plan.maxPages).toBe(4);
  expect(plan.docxPages).toBeLessThanOrEqual(4);
  expect(plan.tier.index).toBeLessThan(TIER_COUNT);
  const L = looks();
  expect(L.Title.sz).toBe(56);
  expect(L.Heading1.sz).toBe(28);
  expect(L.Heading2.sz).toBe(28);
  expect(L.Heading2.caps).toBe(false);
  expect(L.Contact.sz).toBe(20);
  expect(L.Normal.sz).toBe(22);
  expect(L.ListBullet.lineMul).toBeCloseTo(1.2);
  expect(SPEC.styles.Heading2).toMatchObject({ size: 14, bold: true, caps: false, color: '2A7B88' });
  expect(SPEC.colors).toMatchObject({ accent: '39A5B7', heading: '2A7B88', body: '404040' });
  expect(SPEC.rule).toMatchObject({ color: '39A5B7', size: 12 });
  expect(SPEC.bullet).toMatchObject({ left: 216, hanging: 216 });
  expect(await generateResume(p, 'pdf').then((r) => r.pages)).toBe(plan.pages);
  // every project keeps its one-line description and the first 8 tech items (the owner's own edit had them)
  const text = await pdfText((await generateResume(p, 'pdf')).bytes);
  for (const pr of p.projects) {
    expect(flat(text.text), pr.name).toContain(flat((pr.short ?? pr.summary).replace(/\*\*/g, '')));
    for (const tech of pr.techStack.slice(0, 8)) expect(flat(text.text), `${pr.name}: ${tech}`).toContain(flat(tech));
  }
  // the PDF's own sizes: name 28pt, entry lines 14pt, body 11pt, contact 10pt
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array((await generateResume(p, 'pdf')).bytes), verbosity: 0 }).promise;
  const sizes = new Set<number>();
  for (let i = 1; i <= doc.numPages; i++) for (const it of (await (await doc.getPage(i)).getTextContent()).items as any[]) if (it.str.trim()) sizes.add(Math.round(Math.abs(it.transform[3])));
  expect([...sizes].sort((x, y) => x - y)).toEqual([10, 11, 14, 28]);
});

test('contact block, key skills and bold markers', async () => {
  const p = fixture();
  const blocks = buildBlocks(p, tierAt(0));
  const contact = blocks.filter((b) => b.style === 'Contact').map(textOf);
  expect(contact).toHaveLength(3);
  expect(contact[0]).toBe(`Senior Staff Engineer | ${p.contact.phone} | ${p.contact.email}`);
  const contactBlocks = blocks.filter((b) => b.style === 'Contact');
  expect(contactBlocks[0].runs[0]).toMatchObject({ text: 'Senior Staff Engineer', bold: true });
  expect(contactBlocks[0].runs.every((r) => r.bold)).toBe(true);                       // line 1: all bold
  const docxHead = await docxParts((await generateResume(p, 'docx')).bytes);
  expect(docxHead.xml).toMatch(/<w:rStyle w:val="Hyperlink"\/><w:b\/><\/w:rPr><w:t[^>]*>Sarvanamani1992@gmail\.com/);   // bold email link in Word too
  expect(contactBlocks[1].runs.filter((r) => r.bold).map((r) => r.text)).toEqual(['LinkedIn: ', 'Website: ']);
  expect(contactBlocks[2].runs.map((r) => [r.text === 'Address: ', !!r.bold])).toEqual([[true, true], [false, false]]);
  expect(contact[1]).toBe('LinkedIn: linkedin.com/in/saravana-manikandan-s-23935670 | Website: learn-with-saravana.onrender.com');
  expect(contact[2]).toBe(`Address: ${p.contact.address}`);
  expect(contact.join(' ')).not.toContain(p.identity.region);
  const links = blocks.filter((b) => b.style === 'Contact').flatMap((b) => b.runs.filter((r) => r.href).map((r) => r.href));
  expect(links).toEqual([`mailto:${p.contact.email}`, 'https://www.linkedin.com/in/saravana-manikandan-s-23935670/', 'https://learn-with-saravana.onrender.com/']);
  const noAddr = buildBlocks({ ...p, contact: { ...p.contact, address: undefined } }, tierAt(0)).filter((b) => b.style === 'Contact').map(textOf);
  expect(noAddr).toHaveLength(2);
  expect(noAddr[0]).toContain(p.identity.region);
  const bare = buildBlocks({ ...p, contact: { email: p.contact.email, linkedin: '' }, identity: { ...p.identity, headline: '', titles: [] }, skillFocus: undefined }, tierAt(0));
  expect(bare.filter((b) => b.style === 'Contact').map(textOf)).toEqual([`${p.identity.region} | ${p.contact.email}`]);
  expect(bare.some((b) => textOf(b) === 'Key Skills')).toBe(false);
  const i = blocks.findIndex((b) => textOf(b) === 'Key Skills');
  expect(blocks[i - 1].style).toBe('ListBullet');
  expect(blocks[i + 1].runs[0]).toMatchObject({ text: 'Primary: ', bold: true });
  expect(textOf(blocks[i + 1])).toBe('Primary: Java 21, Spring Boot, GCP, DevOps, SQL');
  expect(textOf(blocks[i + 2])).toBe('Secondary: Angular, Python, Kotlin, AI & ML');
  const summary = blocks.find((b) => b.style === 'Normal')!;
  expect(summary.runs.some((r) => r.bold && r.text === '12+ years')).toBe(true);
  expect(blocks.map(textOf).join(' ')).not.toContain('**');
  const tricky: Profile = { ...p, summary: 'Plain **bold** and an **unclosed marker', highlights: ['**All bold highlight**'], identity: { ...p.identity, name: 'Ada **X** Lovelace' } };
  const tb = buildBlocks(tricky, tierAt(0));
  expect(tb.map(textOf).join(' ')).not.toContain('**');
  expect(tb[0].runs.every((r) => !r.bold)).toBe(true);
  const d = await docxParts((await generateResume(tricky, 'docx')).bytes);
  expect(d.xml).not.toContain('**');
  expect(d.xml).toContain('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">bold</w:t>');
  expect((await pdfText((await generateResume(tricky, 'pdf')).bytes)).text).not.toContain('**');
});

test('experience, project and education entries use Heading2 with the template pattern', () => {
  const p = fixture();
  const blocks = buildBlocks(p, tierAt(0));
  const h2 = blocks.filter((b) => b.style === 'Heading2').map(textOf);
  expect(h2[0]).toBe('Senior Staff Engineer | Altimetrik Corp | May\u00A02021\u00A0\u2013 Present');
  expect(h2).toContain('Vehicle Data Services | Altimetrik Corp | Automotive');
  expect(h2).toContain('HAP Digital | Accenture | Insurance');
  // Education is a plain bullet under its section heading (owner's choice), not an entry heading.
  expect(h2.some((t) => t.startsWith('B.E.'))).toBe(false);
  const edu = blocks.findIndex((b) => textOf(b) === 'Education');
  expect(blocks[edu + 1].style).toBe('ListBullet');
  expect(textOf(blocks[edu + 1])).toMatch(/^B\.E\. \(CSE\) \| DMI College of Engineering \| Aug\u00A02010\u00A0\u2013 Apr\u00A02014$/);
  expect(blocks[edu + 1].runs.every((r) => !r.bold)).toBe(true);
  expect(h2.some((t) => t === t.toUpperCase())).toBe(false);
  const noCompany = buildBlocks({ ...p, projects: [{ ...p.projects[0], company: undefined }] }, tierAt(0)).filter((b) => b.style === 'Heading2').map(textOf);
  expect(noCompany).toContain(`${p.projects[0].name} | ${p.projects[0].domain}`);
});

test('all awards are listed once, newest first, undated last, with descriptions', () => {
  const p = fixture();
  const awards = buildBlocks(p, tierAt(0));
  const at = awards.findIndex((b) => textOf(b) === 'Awards');
  const lines = awards.slice(at + 1).filter((b, i, all) => all.slice(0, i).every((x) => x.style !== 'Heading1')).filter((b) => b.style === 'ListBullet').map(textOf);
  const section: string[] = [];
  for (const b of awards.slice(at + 1)) { if (b.style === 'Heading1') break; section.push(textOf(b)); }
  expect(section).toHaveLength(11);
  expect(lines.length).toBeGreaterThanOrEqual(11);
  expect(section[0]).toMatch(/^Rise and Shine \(Apr 2025\) \u2013 /);
  const dated = section.filter((l) => /\((\w{3} \d{4})\)/.test(l));
  expect(dated.length).toBe(p.awards.filter((a) => a.date).length);
  expect(section.slice(0, dated.length)).toEqual(dated);
  expect(section.every((l) => l.includes(' \u2013 '))).toBe(true);
  expect(new Set(section).size).toBe(11);
});

test('tiny profile still works', async () => {
  const tiny: Profile = {
    identity: { name: 'Ada Lovelace', headline: 'Engineer', titles: ['Engineer'], region: 'London' },
    contact: { email: 'ada@example.org', linkedin: 'linkedin.com/in/ada' },
    summary: 'Writes programs.', highlights: [], skills: [], certifications: [], awards: [], projects: [], domains: [], interests: [],
    experience: [{ id: 'e', role: 'Analyst', company: 'Engine Co', location: 'London', start: '2020-01', end: '2021-02', achievements: [] }],
    education: [],
  };
  const plan = planResume(tiny);
  expect(plan.tier.index).toBe(0);
  expect(plan.pages).toBe(1);
  for (const f of ['pdf', 'docx'] as const) expect((await generateResume(tiny, f)).bytes.length).toBeGreaterThan(500);
  const t = await pdfText((await generateResume(tiny, 'pdf')).bytes);
  expect(t.text.toLowerCase()).toContain('analyst | engine co | jan 2020 \u2013 feb 2021');
  expect(t.text).not.toContain('Page');
  expect(t.text).not.toContain('Activities');
});

test('special characters are sanitised and never throw', async () => {
  const p = snapshot();
  const odd: Profile = {
    ...p,
    identity: { ...p.identity, name: '?????? Jos\u00E9 \u201CQ\u201D \u{1F600} Muller' },
    projects: [{ ...p.projects[0], short: undefined, name: 'Pro\u00FDect \u0BA4\u0BAE\u0BBF\u0BB4\u0BCD \u{1F680} X', summary: 'It\u2019s \u201Cgood\u201D \u2014 really \u2713 \u0444.' }, ...p.projects.slice(1)],
    interests: ['\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD', 'caf\u00E9 \u00FF\u00DF'],
  };
  expect(sanitize('Caf\u00E9 \u201Cx\u201D \u2019 \u{1F600} \u0BA4')).toBe('Caf\u00E9 "x" \'');
  for (const f of ['pdf', 'docx'] as const) expect((await generateResume(odd, f)).bytes.length).toBeGreaterThan(500);
  expect(resumeFilename(odd, 'pdf')).toMatch(/^[A-Za-z0-9_]+_Resume\.pdf$/);
  const t = await pdfText((await generateResume(odd, 'pdf')).bytes);
  expect(t.text).toContain('Jos\u00E9 "Q" Muller');
  expect(t.text).toContain('It\'s "good"');
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

test('dedupe: identical project role bullets are dropped only when requested', () => {
  const p = snapshot();
  const role = { title: 'Lead', description: 'Designed the shared pipeline for all vehicle data feeds across regions.' };
  const prof: Profile = { ...p, projects: [0, 1].map((i) => ({ id: `p${i}`, name: `Proj ${i}`, domain: 'X', summary: `Summary ${i} unrelated words here.`, techStack: ['A'], roles: [role] })) };
  const count = (dedupeRoles: boolean) => buildBlocks(prof, { ...tierAt(0), bullets: 3, dedupeRoles }).filter((b) => b.runs.some((r) => r.text.startsWith('Lead:'))).length;
  expect(count(false)).toBe(2);
  expect(count(true)).toBe(1);
});

test('complete-or-omit: long sentences without a short line are dropped, not cut', () => {
  const long = 'Builds an enormously detailed platform that integrates many upstream systems, transforms everything and publishes results to every downstream consumer in real time across regions.';
  expect(whole(long, 60)).toBe('');
  expect(whole(`${long.slice(0, -1)}; second clause stays out.`, 190)).toBe(`${long.slice(0, -1)}.`);
  expect(whole('Short and complete. Another one.', 60)).toBe('Short and complete.');
  expect(firstSentence('Used by senior residents in U.S. community centres. More.')).toBe('Used by senior residents in U.S. community centres.');
  const p = snapshot();
  const prof: Profile = { ...p, projects: [{ id: 'x', name: 'Solo', domain: 'D', summary: long, techStack: ['A'], roles: [{ title: 'Dev', description: long }] }] };
  const texts = buildBlocks(prof, { ...tierAt(0), bullets: 2, summaryChars: 60, bulletChars: 60 }).map(textOf);
  expect(texts.some((t) => t.includes('Builds an enormously'))).toBe(false);
  expect(texts.some((t) => t.startsWith('Dev:'))).toBe(false);
  const withShort = { ...prof, projects: [{ ...prof.projects[0], short: 'One-line project description.' }] };
  expect(buildBlocks(withShort, tierAt(0)).some((b) => b.runs[0].text === 'One-line project description.')).toBe(true);
});

test('levels vary content only, from rich to compact, and never exceed 4 pages', async () => {
  const p = fixture();
  const lens = [...Array(TIER_COUNT).keys()].map((i) => buildBlocks(p, tierAt(i)).length);
  expect(lens.every((n, i) => i === 0 || n <= lens[i - 1])).toBe(true);
  const h = (i: number) => buildBlocks(p, tierAt(i)).filter((b) => b.style === 'Normal' && b.runs[0].text !== 'Tech: ').length;
  expect(h(0)).toBeGreaterThan(h(TIER_COUNT - 1));
  const stressed = stress(stress(p));
  const sp = planResume(stressed);
  expect(sp.pages).toBeLessThanOrEqual(4);
  expect(sp.docxPages).toBeLessThanOrEqual(4);
  expect(sp.tier.index).toBeGreaterThan(planResume(p).tier.index);
  expect(planResume(stress(stress(stress(stress(p))))).pages).toBeLessThanOrEqual(4);
});

test('PDF has clickable email, LinkedIn and website links, and page numbers on pages 2+ only', async () => {
  const p = fixture();
  const pdf = await generateResume(p, 'pdf');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.bytes), verbosity: 0 }).promise;
  const links = (await (await doc.getPage(1)).getAnnotations()).filter((a: any) => a.subtype === 'Link').map((a: any) => a.url as string);
  expect(links.some((u) => u.startsWith('mailto:'))).toBe(true);
  expect(links.some((u) => u.includes('linkedin'))).toBe(true);
  expect(links).toContain(p.contact.website);
  const t = await pdfText(pdf.bytes);
  expect(t.text).toContain('Page 2');
  expect(t.text).not.toContain('Page 1');
});

test('only the contact address is printed; stray address, references and narration never are', async () => {
  const p: any = withPhone(snapshot());
  p.contact.address = '42 Secret Lane, Hiddenville';
  p.address = 'TOPLEVEL-ADDRESS-QZX';
  p.references = [{ name: 'Zebediah Referee', phone: '+1 555 0100 777', email: 'ref@example.org' }];
  p.narration = { about: 'NARRATION-ONLY-TEXT-QZX', tagline: 'NARRATION-TAGLINE-QZX' };
  for (const f of ['pdf', 'docx'] as const) {
    const r = await generateResume(p, f);
    const text = f === 'pdf' ? (await pdfText(r.bytes)).text : (await docxParts(r.bytes)).text;
    expect(text).toContain('42 Secret Lane, Hiddenville');
    for (const bad of ['TOPLEVEL', 'Zebediah', '555 0100', 'ref@example.org', 'QZX']) expect(text).not.toContain(bad);
  }
  const hidden = await generateResume({ ...p, contact: { ...p.contact, address: undefined } }, 'pdf');
  expect((await pdfText(hidden.bytes)).text).not.toContain('Secret Lane');
});

test('google cloud certification is shown once, under Certifications only', async () => {
  const p = snapshot();
  const withAward: Profile = { ...p, awards: [...p.awards, { title: 'Google Cloud Certified Professional Cloud Architect', date: '2022-01-01', description: 'Passed.' }] };
  const t = (await pdfText((await generateResume(withAward, 'pdf')).bytes)).text;
  expect(t.split('Google Cloud Certified Professional Cloud Architect').length - 1).toBe(1);
});

