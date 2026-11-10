// Derives ResumeTemplate-v2.docx from the owner's original template: entry lines (Heading2) get the
// section-heading look (teal, bold, 14pt, title case), Contact lines stack tightly. Everything else is untouched.
// Usage: node scripts/derive-resume-template-v2.mjs [in.docx] [out.docx]
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const input = path.resolve(process.argv[2] ?? path.join(root, 'ResumeTemplate.docx'));
const output = path.resolve(process.argv[3] ?? path.join(root, 'ResumeTemplate-v2.docx'));
const zip = await JSZip.loadAsync(fs.readFileSync(input));
let styles = await zip.file('word/styles.xml').async('string');
const style = (id) => new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`);
const swap = (id, fn) => {
  const m = style(id).exec(styles);
  if (!m) throw new Error(`style ${id} not found`);
  styles = styles.replace(m[0], () => fn(m[0]));
};
const fonts = '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:cstheme="majorBidi" />';
const teal = '<w:color w:val="2A7B88" w:themeColor="accent1" w:themeShade="BF" />';
swap('Heading2', (s) => s
  .replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '<w:pPr><w:keepNext /><w:keepLines /><w:spacing w:before="280" w:after="100" /><w:outlineLvl w:val="1" /></w:pPr>')
  .replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, `<w:rPr>${fonts}<w:b />${teal}<w:sz w:val="28" /><w:szCs w:val="28" /></w:rPr>`));
swap('Heading2Char', (s) => s.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, `<w:rPr>${fonts}<w:b />${teal}<w:sz w:val="28" /><w:szCs w:val="28" /></w:rPr>`));
swap('Contact', (s) => s.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '<w:pPr><w:spacing w:before="120" w:after="0" /><w:contextualSpacing /></w:pPr>'));
zip.file('word/styles.xml', styles);
fs.writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`wrote ${output}`);
