import type { Profile } from '../portfolio/types';
import { buildBlocks, MAX_TIER_INDEX, tierAt, type ResumeBlock, type Run, type Tier } from './model';
import { contentHeight, contentWidth, THEME } from './theme';
import { BOLD, EXTRA_BOLD, EXTRA_REG, REG } from './widths';

export type Seg = { text: string; bold: boolean; href?: string; x: number; w: number };
export type Line = {
  block: number; kind: ResumeBlock['kind']; segs: Seg[]; size: number; lh: number;
  before: number; after: number; indent: number; bullet: boolean; rule: boolean; center: boolean;
  keepNext: boolean; date?: string; dateW?: number; width: number;
  page: number; top: number;
};
export type ResumePlan = {
  tier: Tier; pages: number; docxPages: number; fill: number; lastPageFill: number;
  blocks: ResumeBlock[]; lines: Line[]; fits: boolean;
};

export function textWidth(text: string, bold: boolean, size: number): number {
  const tbl = bold ? BOLD : REG, ex = bold ? EXTRA_BOLD : EXTRA_REG;
  let w = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? tbl[c - 32] : (ex as Record<string, number>)[ch] ?? 556;
  }
  return (w * size) / 1000;
}

function styleOf(kind: ResumeBlock['kind'], t: Tier) {
  const s = t.spacing, f = t.fontSize;
  switch (kind) {
    case 'name': return { size: THEME.nameSize, before: 0, after: 2 * s, center: true };
    case 'headline': return { size: f + 0.5, before: 0, after: 2 * s, center: true };
    case 'contact': return { size: f, before: 0, after: 2 * s, center: true };
    case 'heading': return { size: THEME.headingSize, before: 8 * s, after: 3.5 * s, center: false };
    case 'title': return { size: f, before: 3.5 * s, after: 0.5 * s, center: false };
    case 'bullet': return { size: f, before: 0.8 * s, after: 0, center: false };
    default: return { size: f, before: 1.2 * s, after: 0, center: false };
  }
}

type Word = { text: string; bold: boolean; href?: string };
function words(runs: Run[]): Word[] {
  const out: Word[] = [];
  for (const r of runs) {
    const parts = r.text.split(/(?<= )/);
    for (const p of parts) if (p) out.push({ text: p, bold: !!r.bold, href: r.href });
  }
  // merge pieces so that a word and its trailing space stay together even across a run boundary
  return out;
}

function wrap(runs: Run[], size: number, width: number, firstWidth = width): Seg[][] {
  const ws = words(runs);
  const lines: Seg[][] = [[]];
  let x = 0, limit = firstWidth;
  for (const w of ws) {
    const full = textWidth(w.text, w.bold, size);
    const visible = textWidth(w.text.trimEnd(), w.bold, size);
    if (x + visible > limit + 0.001 && x > 0) {
      const last = lines[lines.length - 1];
      if (last.length) last[last.length - 1] = { ...last[last.length - 1], text: last[last.length - 1].text.trimEnd(), w: textWidth(last[last.length - 1].text.trimEnd(), last[last.length - 1].bold, size) };
      lines.push([]); x = 0; limit = width;
    }
    const cur = lines[lines.length - 1];
    const prev = cur[cur.length - 1];
    if (prev && prev.bold === w.bold && prev.href === w.href) {
      prev.text += w.text; prev.w += full;
    } else cur.push({ text: w.text, bold: w.bold, href: w.href, x, w: full });
    x += full;
  }
  for (const l of lines) {
    const last = l[l.length - 1];
    if (last) { last.text = last.text.trimEnd(); last.w = textWidth(last.text, last.bold, size); }
    let xx = 0;
    for (const s of l) { s.x = xx; xx += s.w; }
  }
  return lines.filter((l) => l.length);
}

export function layoutBlocks(blocks: ResumeBlock[], tier: Tier, capacity = contentHeight()): { lines: Line[]; pages: number; lastPageFill: number } {
  const W = contentWidth();
  const raw: Omit<Line, 'page' | 'top'>[] = [];
  blocks.forEach((blk, bi) => {
    const st = styleOf(blk.kind, tier);
    const lh = st.size * THEME.lineFactor;
    const bullet = blk.kind === 'bullet';
    const indent = bullet ? THEME.textIndent : 0;
    const dateW = blk.kind === 'title' && blk.date ? textWidth(blk.date, false, st.size) : 0;
    const avail = W - indent - (dateW ? dateW + 12 : 0);
    const segLines = wrap(blk.runs, st.size, avail);
    segLines.forEach((segs, i) => {
      raw.push({
        block: bi, kind: blk.kind, segs, size: st.size, lh,
        before: i === 0 ? st.before : 0, after: i === segLines.length - 1 ? st.after : 0,
        indent, bullet: bullet && i === 0, rule: blk.kind === 'heading', center: st.center,
        keepNext: (blk.kind === 'heading' || blk.kind === 'title' || blk.kind === 'name' || blk.kind === 'headline') && i === segLines.length - 1,
        date: i === 0 ? (blk as { date?: string }).date : undefined, dateW, width: W,
      });
    });
  });
  const lines: Line[] = [];
  let page = 0, y = 0;
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    let before = y === 0 ? 0 : l.before;
    let need = before + l.lh + l.after;
    if (l.keepNext && raw[i + 1]) need += raw[i + 1].before + raw[i + 1].lh;
    if (y + need > capacity + 0.001 && y > 0) { page++; y = 0; before = 0; }
    y += before;
    lines.push({ ...l, page, top: y });
    y += l.lh + l.after;
  }
  return { lines, pages: page + 1, lastPageFill: Math.min(1.5, y / capacity) };
}

/** Pure: picks the richest tier fitting exactly 2 pages (PDF exact; DOCX with a safety margin). */
export function planResume(profile: Profile): ResumePlan {
  let result: ResumePlan | null = null;
  for (let i = 0; i <= MAX_TIER_INDEX; i++) {
    const tier = tierAt(i);
    const blocks = buildBlocks(profile, tier);
    const exact = layoutBlocks(blocks, tier);
    const safe = layoutBlocks(blocks, tier, contentHeight() * (1 - THEME.safetyMargin));
    const fits = exact.pages <= 2 && safe.pages <= 2;
    result = { tier, pages: exact.pages, docxPages: safe.pages, fill: exact.pages === 2 ? exact.lastPageFill : exact.lastPageFill / 2, lastPageFill: exact.lastPageFill, blocks, lines: exact.lines, fits };
    if (fits) return result;
  }
  return result!;
}
