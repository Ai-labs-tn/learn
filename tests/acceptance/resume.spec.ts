import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { normalizeEnvelope, type Profile } from '../../src/portfolio/types';
import { generateResume, planResume, resumeFilename } from '../../src/resume';
import { buildBlocks, dedupeHighlights, firstSentence, fmtDate, sanitize, SECTION_HEADINGS, tierAt, TIER_COUNT, whole } from '../../src/resume/model';
import { SPEC } from '../../src/resume/template/spec';

const load = (path: string) => normalizeEnvelope(JSON.parse(readFileSync(path, 'utf8')))!.profile;
const snapshot = () => load('src/portfolio/profile.snapshot.json');
const fixture = () => load('tests/fixtures/profile-from-md.json');
const withPhone = (p: Profile): Profile => ({ ...p, contact: { ...p.contact, phone: '+91 98765 43210' } });
const withExtras = (p: Profile): Profile => ({
  ...p,
  contact: { ...p.contact, website: 'https://example.org/portfolio' },
  experience: p.experience.map((e, i) => ({ ...e, achievements: [`Delivered milestone number ${i + 1} ahead of plan`, `Mentored ${i + 3} engineers on distributed tracing`] })),
  interests: ['Open-source gardening', 'Trail running', 'Chess endgames'],
});
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

const CASES: [string, () => Profile][] = [
  ['real snapshot', snapshot],
  ['synthetic with phone, website, achievements and interests', () => withExtras(withPhone(snapshot()))],
  ...(existsSync('tests/fixtures/profile-from-md.json') ? [['owner fixture', fixture] as [string, () => Profile]] : []),
];

for (const [label, make] of CASES) {
  test(`both formats generate from the template and agree: ${label}`, async () => {
    const p = make();
    const plan = planResume(p);
    const pdf = await generateResume(p, 'pdf');
    const docx = await generateResume(p, 'docx');
    expect(pdf.filename).toBe('Saravanamanikandan_S_Resume.pdf');
    expect(docx.filename).toBe('Saravanamanikandan_S_Resume.docx');
    expect(pdf.mime).toBe('application/pdf');

    // page policy: 2 pages unless really required, never more than 4
    expect(plan.fits).toBe(true);
    expect(plan.pages).toBeLessThanOrEqual(plan.maxPages);
    expect(plan.docxPages).toBeLessThanOrEqual(plan.maxPages);
    expect(plan.maxPages).toBeLessThanOrEqual(4);
    expect(plan.maxPages, 'real data must fit 2 pages').toBe(2);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(plan.pages);
    const t = await pdfText(pdf.bytes);
    expect(t.numPages).toBe(plan.pages);
    expect(docx.pages).toBe(plan.docxPages);

    const d = await docxParts(docx.bytes);
    for (const text of [t.text, d.text]) {
      expect(text).toContain(p.identity.name);
      inOrder(text, SECTION_HEADINGS.filter((h) => {
        if (h === 'Activities and Interests') return p.interests.length > 0;
        if (h === 'Projects') return plan.tier.maxProjects > 0 && p.projects.length > 0;
        if (h === 'Awards') return plan.tier.maxAwards > 0 && p.awards.some((a) => !p.certifications.some((c) => c.name === a.title));
        return true;
      }));
      expect(text).toContain(p.contact.email);
      expect(flat(text)).toContain(flat(p.contact.linkedin.replace(/^https?:\/\//, '').replace(/\/$/, '')));
      if (p.contact.website) expect(flat(text)).toContain(flat(p.contact.website.replace(/^https?:\/\//, '').replace(/\/$/, '')));
      if (p.contact.phone) expect(text).toContain(p.contact.phone); else expect(text).not.toMatch(/\+?\d[\d ()-]{8,}\d/);
      for (const e of p.experience) {
        expect(text.toLowerCase()).toContain(e.company.toLowerCase());
        expect(text.toLowerCase()).toContain(e.role.toLowerCase());
        for (const a of e.achievements) expect(flat(text).split(flat(a)).length - 1, a).toBe(1);
      }
      for (const c of p.certifications) expect(text.split(c.name).length - 1, c.name).toBe(1);
      expect(text.toLowerCase()).toContain(p.education[0].institution.toLowerCase());
      for (const i of p.interests) expect(text).toContain(i);
      if (plan.tier.maxProjects >= p.projects.length) for (const pr of p.projects) expect(text.toLowerCase()).toContain(sanitize(pr.name).toLowerCase());
      if (plan.tier.maxAwards >= p.awards.length) {
        for (const a of p.awards.filter((x) => !p.certifications.some((c) => c.name === x.title))) expect(text).toContain(sanitize(a.title));
      }
      expect(text).toContain('Domain expertise:');
      expect(text.toLowerCase()).toContain('present');
    }
    const strip = (s: string) => s.replace(/\bPage \d+\b/g, ' ').replace(/[\u00B7\u2022]/g, ' ');
    expect([...words(strip(t.text))].sort()).toEqual([...words(d.text)].sort());
    expect(t.text).not.toMatch(/\b\w \w \w \w\b/);

    // DOCX is genuinely the owner's template
    expect(d.xml).not.toMatch(/<w:tbl[ >]/);
    expect(d.xml).not.toContain('<w:drawing');
    expect(d.xml).not.toContain('<w:pict');
    expect(d.xml).not.toContain('<w:txbxContent');
    expect(d.xml).not.toMatch(/May Riley|Contoso|Bigtown/);
    expect(d.xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(d.xml).toMatch(/<w:pgMar w:top="1008" w:right="1152" w:bottom="864" w:left="1152" w:header="288" w:footer="144"/);
    expect(d.xml).toContain('w:val="Title"');
    expect(d.xml).toContain('w:val="Contact"');
    expect(d.xml).toContain('w:val="Heading1"');
    expect(d.xml).toContain('w:val="Heading2"');
    expect(d.xml).toContain('w:val="ListBullet"');
    expect(d.xml).toMatch(/<w:pBdr><w:bottom w:val="single" w:sz="12" [^>]*w:color="39A5B7"/);
    expect(d.names.filter((n) => /^(customXml|docMetadata)\//.test(n) || n === 'docProps/custom.xml')).toEqual([]);
    expect(d.names.some((n) => /^word\/footer\d*\.xml$/.test(n))).toBe(true);
    expect(d.names.filter((n) => /header\d*\.xml$/.test(n))).toEqual([]);
    const styles = await d.read('word/styles.xml');
    expect(styles).toContain('2A7B88');
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
    const core = await d.read('docProps/core.xml');
    expect(core).toContain(`<dc:title>${p.identity.name} \u2013 Resume</dc:title>`);
    expect(core).toContain(`<dc:creator>${p.identity.name}</dc:creator>`);
    expect(core).not.toMatch(/Riley|Microsoft Corporation/);

    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getTitle()).toBe(`${p.identity.name} \u2013 Resume`);
    expect(doc.getAuthor()).toBe(p.identity.name);
    expect(doc.getKeywords()).toBeTruthy();
  });
}

test('styles are taken from the template spec and scaled per tier in the copy only', async () => {
  const p = snapshot();
  const plan = planResume(p);
  const d = await docxParts((await generateResume(p, 'docx')).bytes);
  const styles = await d.read('word/styles.xml');
  const block = (id: string) => new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(styles)![0];
  const f = plan.tier.body / SPEC.defaults.size;
  expect(block('Heading1')).toContain(`<w:sz w:val="${Math.round(SPEC.styles.Heading1.size * f * 2)}"`);
  expect(block('Heading1')).toContain(`w:before="${Math.round(SPEC.styles.Heading1.before * plan.tier.spacing)}"`);
  expect(block('Heading2')).toContain('<w:caps');
  expect(block('Title')).toContain(SPEC.colors.heading);
  expect(SPEC.fonts.major).toBe('Cambria');
  expect(SPEC.colors).toMatchObject({ accent: '39A5B7', heading: '2A7B88', body: '404040', heading2: '262626' });
  expect(SPEC.rule).toMatchObject({ color: '39A5B7', size: 12 });
  expect(SPEC.bullet).toMatchObject({ left: 216, hanging: 216 });
  // generating twice must not leak scaling into a later document
  const rich = await docxParts((await generateResume({ ...p, projects: [], awards: [] }, 'docx')).bytes);
  expect(await rich.read('word/styles.xml')).toContain(`<w:sz w:val="${Math.round(SPEC.styles.Heading1.size * 2)}"`);
});

test('PDF has clickable email, LinkedIn and website links', async () => {
  const pdf = await generateResume(withExtras(snapshot()), 'pdf');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.bytes), verbosity: 0 }).promise;
  const links = (await (await doc.getPage(1)).getAnnotations()).filter((a: any) => a.subtype === 'Link').map((a: any) => a.url as string);
  expect(links.some((u) => u.startsWith('mailto:'))).toBe(true);
  expect(links.some((u) => u.startsWith('https://') && u.includes('linkedin'))).toBe(true);
  expect(links).toContain('https://example.org/portfolio');
});

test('PDF page numbers appear on pages 2+ only, DOCX footer matches the template', async () => {
  const p = snapshot();
  const plan = planResume(p);
  expect(plan.pages).toBeGreaterThan(1);
  const t = await pdfText((await generateResume(p, 'pdf')).bytes);
  expect(t.text).toContain('Page 2');
  expect(t.text).not.toContain('Page 1');
  const d = await docxParts((await generateResume(p, 'docx')).bytes);
  expect(d.xml).toContain('<w:titlePg');
});

test('no address, references or narration ever appear', async () => {
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

test('stress profile grows to at most 4 pages and compact tiers engage; page policy prefers 2 pages', async () => {
  const base = planResume(snapshot());
  const s = stress(snapshot());
  const plan = planResume(s);
  expect(plan.tier.index).toBeGreaterThan(base.tier.index);
  expect(plan.tier.body).toBeGreaterThanOrEqual(9.5);
  expect(plan.pages).toBeLessThanOrEqual(4);
  const pdf = await generateResume(s, 'pdf');
  expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeLessThanOrEqual(4);
  expect((await generateResume(s, 'docx')).pages).toBeLessThanOrEqual(4);
  const extreme = stress(stress(stress(snapshot())));
  const ep = planResume(extreme);
  expect(ep.pages).toBeLessThanOrEqual(4);
  expect(ep.docxPages).toBeLessThanOrEqual(4);
  expect(plan.maxPages).toBeGreaterThanOrEqual(3);
  expect(plan.fits).toBe(true);
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
    projects: [{ ...p.projects[0], name: 'Pro\u00FDect \u0BA4\u0BAE\u0BBF\u0BB4\u0BCD \u{1F680} X', summary: 'It\u2019s \u201Cgood\u201D \u2014 really \u2713 \u0444.' }, ...p.projects.slice(1)],
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

test('dedupe: identical project role bullets are dropped only in compact tiers', () => {
  const p = snapshot();
  const role = { title: 'Lead', description: 'Designed the shared pipeline for all vehicle data feeds across regions.' };
  const prof: Profile = { ...p, projects: [0, 1].map((i) => ({ id: `p${i}`, name: `Proj ${i}`, domain: 'X', summary: `Summary ${i} unrelated words here.`, techStack: ['A'], roles: [role] })) };
  const count = (tier: number) => buildBlocks(prof, tierAt(tier)).filter((b) => b.runs.some((r) => r.text.startsWith('Lead:'))).length;
  expect(count(0)).toBe(2);
  expect(count(5)).toBe(1);
});

test('google cloud certification is shown once, under Certifications only', async () => {
  const p = snapshot();
  const withAward: Profile = { ...p, awards: [...p.awards, { title: 'Google Cloud Certified Professional Cloud Architect', date: '2022-01-01', description: 'Passed.' }] };
  const t = (await pdfText((await generateResume(withAward, 'pdf')).bytes)).text;
  expect(t.split('Google Cloud Certified Professional Cloud Architect').length - 1).toBe(1);
});

const headingTexts = (p: Profile, tier = 0) => buildBlocks(p, tierAt(tier)).filter((b) => b.style === 'Heading2').map((b) => b.runs.map((r) => r.text).join(''));
const section = (p: Profile, tier: number, name: string) => {
  const blocks = buildBlocks(p, tierAt(tier));
  const at = blocks.findIndex((b) => b.style === 'Heading1' && b.runs[0].text === name);
  if (at < 0) return [];
  const rest = blocks.slice(at + 1);
  const end = rest.findIndex((b) => b.style === 'Heading1');
  return (end < 0 ? rest : rest.slice(0, end)).map((b) => b.runs.map((r) => r.text).join(''));
};

for (const [label, make] of CASES) {
  test(`content polish rules hold in every tier: ${label}`, async () => {
    const p = make();
    for (let tier = 0; tier < TIER_COUNT; tier++) {
      const blocks = buildBlocks(p, tierAt(tier));
      // no stub lines: project summaries and role bullets are complete sentences taken whole from the source
      const sources = p.projects.flatMap((x) => [x.short ?? '', x.summary, ...x.roles.map((r) => r.description)]).map(sanitize).filter(Boolean);
      const all = buildBlocks(p, tierAt(tier));
      const at = all.findIndex((x) => x.style === 'Heading1' && x.runs[0].text === 'Projects');
      const end = all.findIndex((x, i) => i > at && x.style === 'Heading1');
      for (const blk of at < 0 ? [] : all.slice(at + 1, end < 0 ? undefined : end)) {
        if (blk.style !== 'Normal' && blk.style !== 'ListBullet') continue;
        const text = sanitize(blk.runs.map((r) => r.text).join(''));
        if (text.startsWith('Tech:')) continue;
        const body = blk.style === 'ListBullet' ? text.slice(text.indexOf(': ') + 2) : text;
        if (!sources.includes(body)) expect(body, text).toMatch(/[.!?]$/);
        expect(sources.some((s) => body.replace(/\.$/, '').split('; ').every((cl) => s.includes(cl))), text).toBe(true);
      }
      for (const proj of p.projects) {
        if (proj.short) expect(blocks.some((x) => x.runs.map((r) => r.text).join('') === sanitize(proj.short!)), proj.name).toBe(true);
      }
      // headings follow the template pattern; dates never break
      for (const e of p.experience) {
        const h = headingTexts(p, tier).find((t) => t.toLowerCase().startsWith(`${e.role} | ${e.company} | `.toLowerCase()));
        expect(h, e.role).toBeTruthy();
        expect(h).not.toContain(e.location);
        expect(h).toMatch(/[A-Z][a-z]{2}\u00A0\d{4}\u00A0\u2013 ([A-Z][a-z]{2}\u00A0\d{4}|Present)$/);
      }
      const edu = headingTexts(p, tier).find((t) => t.startsWith(p.education[0].level))!;
      const dates = `${fmtDate(p.education[0].start).replace(' ', '\u00A0')}\u00A0\u2013 ${fmtDate(p.education[0].end).replace(' ', '\u00A0')}`;
      const withCity = `${p.education[0].level} | ${p.education[0].institution}, ${p.education[0].location.split(',')[0]} | ${dates}`;
      // The city is dropped when the heading would otherwise wrap (more than 78 characters).
      expect(edu).toBe(withCity.length > 78 ? `${p.education[0].level} | ${p.education[0].institution} | ${dates}` : withCity);
      // awards: never repeated from an experience bullet, always with their description, trimmed only from the end
      const bullets = p.experience.flatMap((e) => e.achievements).join(' ').toLowerCase();
      const awards = section(p, tier, 'Awards');
      for (const a of p.awards) {
        const mentioned = fmtDate(a.date) && bullets.includes(a.title.toLowerCase()) && bullets.includes(fmtDate(a.date).toLowerCase());
        if (mentioned) expect(awards.some((l) => l.startsWith(`${a.title} (${fmtDate(a.date)})`)), a.title).toBe(false);
      }
      for (const l of awards) {
        const a = p.awards.find((x) => l.startsWith(x.title));
        if (a?.description && whole(a.description, 240)) expect(l, l).toContain(' \u2013 ');
      }
    }
  });
}

test('title line shows the headline with pipes in both formats', async () => {
  const p = fixture();
  const expected = p.identity.headline.split(/\s*\u00B7\s*/).join(' | ');
  for (const f of ['pdf', 'docx'] as const) {
    const r = await generateResume(p, f);
    const text = f === 'pdf' ? (await pdfText(r.bytes)).text : (await docxParts(r.bytes)).text;
    const at = text.indexOf(expected);
    expect(at, f).toBeGreaterThan(0);
    expect(at).toBeLessThan(text.indexOf(p.contact.email));
    expect(text.indexOf(p.identity.name)).toBeLessThan(at);
  }
  const d = await docxParts((await generateResume(p, 'docx')).bytes);
  expect(d.xml).toMatch(/[A-Z][a-z]{2}\u00A0\d{4}\u00A0\u2013 /);
  const noHeadline = { ...p, identity: { ...p.identity, headline: '' } };
  expect((await pdfText((await generateResume(noHeadline, 'pdf')).bytes)).text).toContain(p.identity.titles.join(' | '));
});

test('complete-or-omit: long sentences without a short line are dropped, not cut', () => {
  const long = 'Builds an enormously detailed platform that integrates many upstream systems, transforms everything and publishes results to every downstream consumer in real time across regions.';
  expect(whole(long, 60)).toBe('');
  expect(whole(`${long.slice(0, -1)}; second clause stays out.`, 190)).toBe(`${long.slice(0, -1)}.`);
  expect(whole('Short and complete. Another one.', 60)).toBe('Short and complete.');
  expect(firstSentence('Used by senior residents in U.S. community centres. More.')).toBe('Used by senior residents in U.S. community centres.');
  const p = snapshot();
  const prof: Profile = { ...p, projects: [{ id: 'x', name: 'Solo', domain: 'D', summary: long, techStack: ['A'], roles: [{ title: 'Dev', description: long }] }] };
  const texts = buildBlocks(prof, tierAt(TIER_COUNT - 1)).map((b) => b.runs.map((r) => r.text).join(''));
  expect(texts.some((t) => t.includes('Builds an enormously'))).toBe(false);
  expect(texts.some((t) => t.startsWith('Dev:'))).toBe(false);
  const withShort = { ...prof, projects: [{ ...prof.projects[0], short: 'One-line project description.' }] };
  expect(buildBlocks(withShort, tierAt(TIER_COUNT - 1)).some((b) => b.runs[0].text === 'One-line project description.')).toBe(true);
});

test('awards named in an experience bullet are not repeated; remaining awards keep descriptions', () => {
  const p = snapshot();
  const prof: Profile = {
    ...p, certifications: [],
    awards: [
      { title: 'Customer Champion', date: '2024-06-14', description: 'Pilot project on geospatial data visualisation.' },
      { title: 'Customer Champion', date: '2023-12-18', description: 'Launch of the Technician feature.' },
      { title: 'ACE', date: null, description: 'ELK log monitoring in Spring Boot.' },
    ],
    experience: [{ id: 'e', role: 'Eng', company: 'Co', location: 'X', start: '2020-01', end: null, achievements: ['Piloted GeoServer (customer champion award, Jun 2024).'] }],
  };
  expect(section(prof, 0, 'Awards')).toEqual(['Customer Champion (Dec 2023) \u2013 Launch of the Technician feature.', 'ACE \u2013 ELK log monitoring in Spring Boot.']);
  for (let t = 0; t < TIER_COUNT; t++) expect(section(prof, t, 'Awards').every((l) => l.includes(' \u2013 '))).toBe(true);
});