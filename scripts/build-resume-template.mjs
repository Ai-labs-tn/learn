// Sanitises the owner's Word resume template and extracts its look into generated modules.
// Usage: npm run resume:template [-- --template <path-to-docx>]  (default: ../ResumeTemplate-v2.docx, made from ResumeTemplate.docx by scripts/derive-resume-template-v2.mjs)
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argAt = process.argv.indexOf('--template');
const templatePath = path.resolve(argAt > 0 ? process.argv[argAt + 1] : path.join(root, '..', 'ResumeTemplate-v2.docx'));
const outDir = path.join(root, 'src', 'resume', 'template');
const A4 = { w: 11906, h: 16838 };

const attr = (xml, tag, name) => new RegExp(`<${tag}\\b[^>]*?\\b${name}="([^"]*)"`).exec(xml)?.[1];
const num = (v) => (v === undefined ? undefined : Number(v));

const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
const text = (p) => zip.file(p)?.async('string');
const need = async (p) => {
  const t = await text(p);
  if (!t) throw new Error(`Template is missing ${p}`);
  return t;
};

// ---------- extract the look before the sample body is stripped ----------
const styles = await need('word/styles.xml');
const document = await need('word/document.xml');
const numbering = await need('word/numbering.xml');
const themePath = Object.keys(zip.files).find((n) => /^word\/theme\/theme\d*\.xml$/.test(n));
const theme = await need(themePath);
const footerPath = Object.keys(zip.files).find((n) => /^word\/footer\d*\.xml$/.test(n));
const footer = footerPath ? await text(footerPath) : '';

const fontOf = (kind) => attr(new RegExp(`<a:${kind}Font>[\\s\\S]*?</a:${kind}Font>`).exec(theme)?.[0] ?? '', 'a:latin', 'typeface');
const fonts = { major: fontOf('major'), minor: fontOf('minor') };
if (!fonts.major || !fonts.minor) throw new Error('Template theme has no major/minor latin font');
const accentTheme = attr(/<a:accent1>[\s\S]*?<\/a:accent1>/.exec(theme)?.[0] ?? '', 'a:srgbClr', 'val');

const docDefaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] ?? '';
const defaultsRpr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(docDefaults)?.[0] ?? '';
const defaults = {
  size: num(attr(defaultsRpr, 'w:sz', 'w:val')) / 2,
  color: attr(defaultsRpr, 'w:color', 'w:val'),
  after: num(attr(/<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>/.exec(docDefaults)?.[0] ?? '', 'w:spacing', 'w:after')) || 0,
  font: /asciiTheme="major/.test(defaultsRpr) ? 'major' : 'minor',
};

function ownProps(id) {
  const xml = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(styles)?.[0];
  if (!xml) throw new Error(`Template has no style "${id}"`);
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(xml)?.[0] ?? '';
  const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(xml.replace(pPr, ''))?.[0] ?? '';
  const flag = (src, tag) => { const m = new RegExp(`<w:${tag}\\b(?: w:val="([^"]*)")?\\s*/>`).exec(src); return m ? !/^(0|false|off)$/.test(m[1] ?? '') : undefined; };
  const font = /asciiTheme="(major|minor)/.exec(rPr)?.[1];
  const sp = /<w:spacing\b[^>]*\/>/.exec(pPr)?.[0] ?? '';
  return {
    basedOn: attr(xml, 'w:basedOn', 'w:val'),
    size: num(attr(rPr, 'w:sz', 'w:val')) / 2 || undefined,
    bold: flag(rPr, 'b'), caps: flag(rPr, 'caps'),
    color: attr(rPr, 'w:color', 'w:val'),
    font,
    before: num(attr(sp, 'w:spacing', 'w:before')), after: num(attr(sp, 'w:spacing', 'w:after')),
    line: num(attr(sp, 'w:spacing', 'w:line')), lineRule: attr(sp, 'w:spacing', 'w:lineRule'),
    contextual: flag(pPr, 'contextualSpacing'), keepNext: flag(pPr, 'keepNext'), keepLines: flag(pPr, 'keepLines'),
    numId: num(attr(pPr, 'w:numId', 'w:val')),
    jc: attr(pPr, 'w:jc', 'w:val'),
  };
}
function resolve(id) {
  const own = ownProps(id);
  const base = own.basedOn ? resolve(own.basedOn) : { size: defaults.size, color: defaults.color, font: defaults.font, after: defaults.after, before: 0, bold: false, caps: false, contextual: false, keepNext: false, keepLines: false };
  const out = { ...base };
  for (const [k, v] of Object.entries(own)) if (k !== 'basedOn' && v !== undefined) out[k] = v;
  return out;
}
const pick = (id) => {
  const s = resolve(id);
  return {
    font: fonts[s.font], size: s.size, bold: !!s.bold, caps: !!s.caps, color: s.color,
    before: s.before ?? 0, after: s.after ?? 0, line: s.line ?? 240, lineRule: s.lineRule ?? 'auto',
    contextual: !!s.contextual, keepNext: !!s.keepNext, keepLines: !!s.keepLines, jc: s.jc ?? 'left',
  };
};

const sect = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(document.slice(document.lastIndexOf('<w:body>')))?.[0];
if (!sect) throw new Error('Template body has no final sectPr');
const mar = (n) => num(attr(sect, 'w:pgMar', `w:${n}`));

const lvl0 = (() => {
  const numId = ownProps('ListBullet').numId;
  const abs = attr(new RegExp(`<w:num w:numId="${numId}"[\\s\\S]*?</w:num>`).exec(numbering)?.[0] ?? '', 'w:abstractNumId', 'w:val');
  const lvl = /<w:lvl w:ilvl="0"[\s\S]*?<\/w:lvl>/.exec(new RegExp(`<w:abstractNum\\b[^>]*w:abstractNumId="${abs}"[\\s\\S]*?</w:abstractNum>`).exec(numbering)?.[0] ?? '')?.[0] ?? '';
  const ch = attr(lvl, 'w:lvlText', 'w:val') ?? '\u2022';
  return { left: num(attr(lvl, 'w:ind', 'w:left')), hanging: num(attr(lvl, 'w:ind', 'w:hanging')), char: ch.codePointAt(0) >= 0xf000 ? '\u2022' : ch };
})();

const border = /<w:(?:tcBorders|pBdr)>[\s\S]*?<w:bottom\b[^>]*\/>/.exec(document)?.[0] ?? '';
const spec = {
  generatedFrom: path.basename(templatePath),
  page: { width: A4.w, height: A4.h, top: mar('top'), bottom: mar('bottom'), left: mar('left'), right: mar('right'), header: mar('header'), footer: mar('footer') },
  fonts,
  colors: { accent: accentTheme, heading: pick('Heading1').color, body: defaults.color, heading2: pick('Heading2').color },
  defaults: { size: defaults.size, after: defaults.after },
  styles: { Normal: pick('Normal'), Title: pick('Title'), Contact: pick('Contact'), Heading1: pick('Heading1'), Heading2: pick('Heading2'), ListBullet: pick('ListBullet'), Footer: pick('Footer'), Hyperlink: pick('Hyperlink') },
  bullet: { left: lvl0.left, hanging: lvl0.hanging, char: lvl0.char },
  rule: { color: attr(border, 'w:bottom', 'w:color') ?? accentTheme, size: num(attr(border, 'w:bottom', 'w:sz')) ?? 12, space: 1 },
  footer: { text: /<w:t[^>]*>([^<]*)<\/w:t>/.exec(footer)?.[1]?.trim() ?? 'Page', color: pick('Footer').color, align: pick('Footer').jc, firstPageBlank: /<w:titlePg\b/.test(sect) },
};
spec.styles.Hyperlink.underline = /<w:u\b/.test(/<w:style\b[^>]*w:styleId="Hyperlink"[\s\S]*?<\/w:style>/.exec(styles)?.[0] ?? '');
for (const [k, v] of Object.entries(spec.styles)) if (!v.size || !v.color) throw new Error(`Could not read size/colour of style ${k}`);

// ---------- sanitise the package ----------
for (const name of Object.keys(zip.files)) {
  if (/^(customXml|docMetadata)\//.test(name) || name === 'docProps/custom.xml') zip.remove(name);
}
const dropRels = (xml) => xml.replace(/<Relationship\b[^>]*\/>/g, (r) => (/\/relationships\/(customXml|custom-properties)"|classificationlabels"|Target="\/?(customXml|docMetadata)\/|Target="docProps\/custom\.xml"/.test(r) ? '' : r));
zip.file('_rels/.rels', dropRels(await need('_rels/.rels')));
zip.file('word/_rels/document.xml.rels', dropRels(await need('word/_rels/document.xml.rels')));
zip.file('[Content_Types].xml', (await need('[Content_Types].xml')).replace(/<Override\b[^>]*\/>/g, (o) => (/PartName="\/(customXml|docMetadata)\/|PartName="\/docProps\/custom\.xml"/.test(o) ? '' : o)));
zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title></dc:title><dc:creator></dc:creator></cp:coreProperties>');
zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion></Properties>');

const bodyAt = document.indexOf('<w:body>') + '<w:body>'.length;
const a4Sect = sect.replace(/<w:pgSz\b[^>]*\/>/, `<w:pgSz w:w="${A4.w}" w:h="${A4.h}" />`);
zip.file('word/document.xml', document.slice(0, bodyAt) + a4Sect + '</w:body></w:document>');

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
fs.mkdirSync(outDir, { recursive: true });
const banner = `// Generated by scripts/build-resume-template.mjs from ${path.basename(templatePath)} - do not edit; re-run \`npm run resume:template\`.\n`;
fs.writeFileSync(path.join(outDir, 'template-data.ts'), `${banner}export const TEMPLATE_B64 = '${buf.toString('base64')}';\n`);
fs.writeFileSync(path.join(outDir, 'spec.ts'), `${banner}export const SPEC = ${JSON.stringify(spec, null, 2)};\nexport type TemplateSpec = typeof SPEC;\n`);
console.log(`template: ${buf.length} bytes (zip), spec written to ${path.relative(root, outDir)}`);
