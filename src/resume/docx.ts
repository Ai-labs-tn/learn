import type { Profile } from '../portfolio/types';
import { titleRuleSpace, type ResumePlan } from './layout';
import { footerSz, looks, STYLE_IDS, type Look } from './look';
import type { Para, Run } from './model';
import { sanitize } from './model';
import { SPEC } from './template/spec';
import { TEMPLATE_B64 } from './template/template-data';
import { b64ToBytes, docTitle, topSkills } from './util';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const styleBlock = (xml: string, id: string) => new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(xml)?.[0];

/** Scales the COPY's styles (sizes and spacing) to the tier; the stored template is never modified. */
export function patchStyles(xml: string, plan: ResumePlan): string {
  const L = looks(plan.tier);
  const setSpacing = (s: string, before?: number, after?: number) => s.replace(/<w:spacing\b[^>]*\/>/, (sp) => {
    let out = sp;
    if (before !== undefined) out = out.replace(/(\bw:before=")\d+/, `$1${before}`);
    if (after !== undefined) out = out.replace(/(\bw:after=")\d+/, `$1${after}`);
    return out;
  });
  const setSize = (s: string, sz: number) => s.replace(/(<w:sz\b[^>]*\bw:val=")\d+/, `$1${sz}`).replace(/(<w:szCs\b[^>]*\bw:val=")\d+/, `$1${sz}`);
  let out = xml.replace(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, (d) => setSpacing(setSize(d, footerSz(plan.tier)), undefined, L.Normal.afterTw));
  for (const id of STYLE_IDS) {
    const block = styleBlock(out, id);
    if (!block || id === 'Normal') continue;
    const l: Look = L[id];
    let next = setSpacing(block, SPEC.styles[id].before ? l.beforeTw : undefined, /w:after="/.test(block) ? l.afterTw : undefined);
    if (/<w:sz\b/.test(next)) next = setSize(next, l.sz);
    out = out.replace(block, () => next);
  }
  return out;
}

export async function renderDocx(profile: Profile, plan: ResumePlan): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(b64ToBytes(TEMPLATE_B64));
  const read = async (p: string) => {
    const f = zip.file(p);
    if (!f) throw new Error(`Template part missing: ${p}`);
    return f.async('string');
  };
  const L = looks(plan.tier);
  zip.file('word/styles.xml', patchStyles(await read('word/styles.xml'), plan));

  const links: { id: string; href: string }[] = [];
  const linkId = (href: string) => {
    let l = links.find((x) => x.href === href);
    if (!l) { l = { id: `rIdResumeLink${links.length + 1}`, href }; links.push(l); }
    return l.id;
  };
  const run = (r: Run) => {
    const rpr = r.href ? '<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>' : r.bold ? '<w:rPr><w:b/></w:rPr>' : '';
    const el = `<w:r>${rpr}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
    return r.href ? `<w:hyperlink r:id="${linkId(r.href)}" w:history="1">${el}</w:hyperlink>` : el;
  };
  const para = (p: Para) => {
    let ppr = `<w:pStyle w:val="${p.style}"/>`;
    if (p.style === 'Title') {
      const space = titleRuleSpace(L.Title);
      ppr += `<w:pBdr><w:bottom w:val="single" w:sz="${SPEC.rule.size}" w:space="${space}" w:color="${SPEC.rule.color}"/></w:pBdr><w:spacing w:after="0"/>`;
    } else if (p.after !== undefined) {
      ppr += `<w:spacing w:after="${Math.round(p.after * plan.tier.spacing)}"/>`;
    }
    return `<w:p><w:pPr>${ppr}</w:pPr>${p.runs.map(run).join('')}</w:p>`;
  };
  const body = plan.blocks.map(para).join('');
  const doc = await read('word/document.xml');
  zip.file('word/document.xml', doc.replace('<w:body>', () => `<w:body>${body}`));

  const rels = await read('word/_rels/document.xml.rels');
  const extra = links.map((l) => `<Relationship Id="${l.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.href)}" TargetMode="External"/>`).join('');
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', () => `${extra}</Relationships>`));

  const name = sanitize(profile.identity.name);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(docTitle(profile))}</dc:title><dc:subject>${esc(`Resume of ${name}`)}</dc:subject><dc:creator>${esc(name)}</dc:creator><cp:keywords>${esc(topSkills(profile).join(', '))}</cp:keywords><cp:lastModifiedBy>${esc(name)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
