import type { Profile } from '../portfolio/types';
import { contentHeight, contentWidth, looks, tw2pt, type Look, type StyleId } from './look';
import { buildBlocks, MAX_TIER_INDEX, supported, tierAt, TIER_COUNT, type Para, type Run, type Tier } from './model';
import { SPEC } from './template/spec';
import { ASCENT_EM, BOLD, LINE_EM, REG } from './widths';

export type Seg = { text: string; bold: boolean; href?: string; x: number; w: number };
export type Line = {
  para: number; style: StyleId; segs: Seg[]; size: number; lh: number; indent: number;
  bullet: boolean; first: boolean; page: number; top: number; look: Look;
};
export type ResumePlan = {
  tier: Tier; maxPages: number;
  /** Pages with exact metrics (what the PDF has). */
  pages: number;
  /** Pages with the Word safety margin applied (what the DOCX is planned for). */
  docxPages: number;
  lastPageFill: number;
  blocks: Para[]; lines: Line[]; fits: boolean;
};

/** Fraction of each page kept free in the DOCX estimate because Word may reflow slightly differently (line counts and page breaks matched Word exactly in every check, so 3% instead of 7%). */
/** Word wraps a hair earlier than exact advance widths predict (measured: lines filled to within ~2pt of the measure wrapped). */
const WRAP_SLACK = -2;
export const SAFETY_MARGIN = 0.03;
/** Distance from the bottom of the name line to the bottom of the rule: border space (whole pt) plus line width. */
export const titleRuleSpace = (look: Look): number => Math.min(31, Math.round(tw2pt(look.afterTw)));
export const ruleWidthPt = (): number => SPEC.rule.size / 8;
export const titleRuleDrop = (look: Look): number => titleRuleSpace(look) + ruleWidthPt();
export const bulletIndentPt = (): number => tw2pt(SPEC.bullet.left);

export function textWidth(text: string, bold: boolean, size: number): number {
  const tbl = bold ? BOLD : REG;
  let w = 0;
  for (const ch of text) w += tbl[ch.codePointAt(0)!] ?? 500;
  return (w * size) / 1000;
}

/** What Word's all-caps formatting shows (and what the PDF draws). */
export function upper(text: string): string {
  let out = '';
  for (const ch of text) {
    const u = ch.toUpperCase();
    out += [...u].every(supported) ? u : ch;
  }
  return out;
}

type Piece = { text: string; bold: boolean; href?: string };
type Word = Piece[];
function words(runs: Run[], bold: boolean, caps: boolean): Word[] {
  const out: Word[] = [];
  let cur: Word = [];
  const chars: { ch: string; bold: boolean; href?: string }[] = [];
  for (const r of runs) for (const ch of caps ? upper(r.text) : r.text) chars.push({ ch, bold: bold || !!r.bold, href: r.href });
  const alnum = (c?: string) => !!c && /[A-Za-z0-9]/.test(c);
  chars.forEach((c, i) => {
    const last = cur[cur.length - 1];
    if (last && last.bold === c.bold && last.href === c.href) last.text += c.ch;
    else cur.push({ text: c.ch, bold: c.bold, href: c.href });
    if (c.ch === ' ' || (c.ch === '-' && alnum(chars[i - 1]?.ch) && alnum(chars[i + 1]?.ch))) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

function wrap(runs: Run[], size: number, width: number, bold: boolean, caps: boolean): Seg[][] {
  const lines: Seg[][] = [[]];
  let x = 0;
  const trimW = (w: Word) => {
    const flat = w.map((p) => ({ ...p }));
    const lastP = flat[flat.length - 1];
    lastP.text = lastP.text.replace(/ +$/, '');
    return flat.reduce((a, p) => a + textWidth(p.text, p.bold, size), 0);
  };
  const push = (p: Piece) => {
    const cur = lines[lines.length - 1];
    const prev = cur[cur.length - 1];
    const w = textWidth(p.text, p.bold, size);
    if (prev && prev.bold === p.bold && prev.href === p.href) { prev.text += p.text; prev.w += w; }
    else cur.push({ text: p.text, bold: p.bold, href: p.href, x, w });
    x += w;
  };
  for (const word of words(runs, bold, caps)) {
    const visible = trimW(word);
    if (x > 0 && x + visible > width + 0.001) { lines.push([]); x = 0; }
    if (visible > width) {
      for (const p of word) for (const ch of p.text) {
        if (x > 0 && x + textWidth(ch, p.bold, size) > width) { lines.push([]); x = 0; }
        push({ text: ch, bold: p.bold, href: p.href });
      }
    } else for (const p of word) push(p);
  }
  return lines.map((segs) => {
    if (segs.length) segs[segs.length - 1].text = segs[segs.length - 1].text.replace(/ +$/, '');
    let xx = 0;
    for (const s of segs) { s.w = textWidth(s.text, s.bold, size); s.x = xx; xx += s.w; }
    return segs.filter((s) => s.text);
  }).filter((l) => l.length);
}

type Item = { para: Para; look: Look; size: number; lh: number; lines: Seg[][]; before: number; after: number; indent: number };

function measure(blocks: Para[]): Item[] {
  const L = looks();
  return blocks.map((para) => {
    const look = L[para.style];
    const size = look.sz / 2;
    const indent = para.style === 'ListBullet' ? bulletIndentPt() : 0;
    const lines = wrap(para.runs, size, contentWidth() - indent - WRAP_SLACK, look.bold, look.caps);
    const afterTw = para.after !== undefined ? para.after : look.afterTw;
    // The name paragraph carries the rule as a bottom border: space + line width replace its own space-after.
    const after = para.style === 'Title' ? titleRuleDrop(look) : tw2pt(afterTw);
    return { para, look, size, lh: size * LINE_EM * look.lineMul, lines, before: tw2pt(look.beforeTw), after, indent };
  });
}

/** Word: contextual spacing removes the spacing between paragraphs of the same style; otherwise the larger of space-after/space-before wins (measured in Word). */
function gap(prev: Item | undefined, cur: Item): number {
  if (!prev) return 0;
  if (cur.look.contextual && prev.look.id === cur.look.id) return 0;
  if (prev.look.id === 'Title') return prev.after + cur.before;
  return Math.max(prev.after, cur.before);
}

export function layoutBlocks(blocks: Para[], capacity = contentHeight()): { lines: Line[]; pages: number; lastPageFill: number } {
  const items = measure(blocks);
  const lines: Line[] = [];
  let page = 0, y = 0;
  const EPS = 0.01;
  const newPage = () => { page++; y = 0; };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const prev = items[i - 1];
    const n = it.lines.length;
    // keep-with-next chain: this paragraph must start on the same page as the first lines of what follows
    if (it.look.keepNext) {
      let need = y === 0 ? 0 : gap(prev, it);
      need += n * it.lh;
      let j = i;
      while (items[j].look.keepNext && items[j + 1]) {
        const nx = items[j + 1];
        need += gap(items[j], nx) + Math.min(nx.lines.length, nx.look.keepLines ? nx.lines.length : 2) * nx.lh;
        j++;
      }
      if (y > 0 && y + need > capacity + EPS) newPage();
    }
    let start = 0;
    while (start < n) {
      const g = y === 0 ? 0 : start === 0 ? gap(prev, it) : 0;
      const room = capacity - y - g;
      let k = Math.max(0, Math.floor((room + EPS) / it.lh));
      const rem = n - start;
      if (k < rem) {
        if (it.look.keepLines) k = 0;
        else {
          if (start === 0 && k < 2) k = 0;
          if (rem - k < 2) k = rem - 2 > 0 ? rem - 2 : 0;
          if (start === 0 && k < 2) k = 0;
        }
        if (k <= 0) {
          if (y > 0) { newPage(); continue; }
          k = 1;
        }
      } else k = rem;
      y += g;
      for (let m = 0; m < k; m++) {
        lines.push({ para: i, style: it.para.style, segs: it.lines[start + m], size: it.size, lh: it.lh, indent: it.indent, bullet: it.para.style === 'ListBullet' && start + m === 0, first: start + m === 0, page, top: y, look: it.look });
        y += it.lh;
      }
      start += k;
      if (start < n) newPage();
    }
  }
  return { lines, pages: page + 1, lastPageFill: Math.min(1.5, y / capacity) };
}

/** Baseline offset from the top of a line box: Cambria ascent (Word puts extra line spacing below the text). */
export const baselineOffset = (size: number): number => size * ASCENT_EM;

/**
 * Pure. Page policy: richest tier that fits 2 pages (PDF exact, DOCX with a safety margin); only if even the
 * most compact readable tier does not fit, the richest tier fitting 3 pages, then 4; last resort truncates content.
 */
export function planResume(profile: Profile): ResumePlan {
  const cache = new Map<number, { tier: Tier; blocks: Para[]; exact: ReturnType<typeof layoutBlocks>; safe: ReturnType<typeof layoutBlocks> }>();
  const evalTier = (i: number) => {
    let e = cache.get(i);
    if (!e) {
      const tier = tierAt(i);
      const blocks = buildBlocks(profile, tier);
      e = { tier, blocks, exact: layoutBlocks(blocks), safe: layoutBlocks(blocks, contentHeight() * (1 - SAFETY_MARGIN)) };
      cache.set(i, e);
    }
    return e;
  };
  const make = (i: number, maxPages: number): ResumePlan => {
    const e = evalTier(i);
    return { tier: e.tier, maxPages, pages: e.exact.pages, docxPages: e.safe.pages, lastPageFill: e.exact.lastPageFill, blocks: e.blocks, lines: e.exact.lines, fits: e.exact.pages <= maxPages && e.safe.pages <= maxPages };
  };
  // Owner decision: keep the richest content, allowing up to 4 pages, instead of trimming to squeeze into 3.
  for (let i = 0; i < TIER_COUNT; i++) { const p = make(i, 4); if (p.fits) return p; }
  let last = make(TIER_COUNT, 4);
  for (let i = TIER_COUNT; i <= MAX_TIER_INDEX; i++) { last = make(i, 4); if (last.fits) return last; }
  return last;
}
