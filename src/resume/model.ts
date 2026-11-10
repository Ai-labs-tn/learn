import type { Profile } from '../portfolio/types';

export type Run = { text: string; bold?: boolean; href?: string };
export type ResumeBlock =
  | { kind: 'name'; runs: Run[] }
  | { kind: 'headline'; runs: Run[] }
  | { kind: 'contact'; runs: Run[] }
  | { kind: 'heading'; runs: Run[] }
  | { kind: 'para'; runs: Run[] }
  | { kind: 'bullet'; runs: Run[] }
  | { kind: 'title'; runs: Run[]; date?: string };

export type Tier = {
  index: number;
  name: string;
  fontSize: number;
  spacing: number;
  bullets: number;
  bulletChars: number;
  summaryChars: number;
  tech: number;
  awardDesc: boolean;
  highlights: boolean;
  summarySentences: number;
  maxProjects: number;
  maxAwards: number;
};

const BASE = { spacing: 1, awardDesc: true, highlights: true, summarySentences: 9, maxProjects: 99, maxAwards: 99 };
const LADDER: Omit<Tier, 'index' | 'name'>[] = [
  { ...BASE, fontSize: 10, bullets: 3, bulletChars: 200, summaryChars: 150, tech: 10 },
  { ...BASE, fontSize: 10, bullets: 2, bulletChars: 170, summaryChars: 150, tech: 10 },
  { ...BASE, fontSize: 10, bullets: 2, bulletChars: 150, summaryChars: 150, tech: 8 },
  { ...BASE, fontSize: 10, bullets: 2, bulletChars: 120, summaryChars: 130, tech: 6 },
  { ...BASE, fontSize: 9.5, bullets: 2, bulletChars: 150, summaryChars: 150, tech: 8 },
  { ...BASE, fontSize: 9.5, bullets: 2, bulletChars: 120, summaryChars: 130, tech: 6 },
  { ...BASE, fontSize: 9.5, bullets: 1, bulletChars: 150, summaryChars: 150, tech: 8 },
  { ...BASE, fontSize: 9.5, bullets: 1, bulletChars: 120, summaryChars: 120, tech: 6 },
  { ...BASE, fontSize: 9, bullets: 1, bulletChars: 120, summaryChars: 120, tech: 6, spacing: 0.85 },
  { ...BASE, fontSize: 9, bullets: 0, bulletChars: 120, summaryChars: 120, tech: 6, spacing: 0.85, awardDesc: false },
  { ...BASE, fontSize: 9, bullets: 0, bulletChars: 100, summaryChars: 100, tech: 6, spacing: 0.8, awardDesc: false, highlights: false, summarySentences: 2 },
];
export const TIER_COUNT = LADDER.length;

/** Ladder tiers, then truncation tiers that drop lowest-priority content (awards, oldest projects). */
export function tierAt(i: number): Tier {
  if (i < LADDER.length) return { ...LADDER[i], index: i, name: `T${i + 1}` };
  const k = i - LADDER.length + 1;
  const last = LADDER[LADDER.length - 1];
  return {
    ...last, index: i, name: `T${LADDER.length}-trim${k}`,
    maxProjects: Math.max(0, 10 - k), maxAwards: Math.max(0, 11 - k),
  };
}
export const MAX_TIER_INDEX = LADDER.length + 11;

const FIX: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2212': '-', '\u2026': '...', '\u00A0': ' ', '\u2009': ' ', '\u200B': '',
  '\u2192': '->', '\u00D7': 'x', '\u2022': '', '\t': ' ', '\n': ' ', '\r': ' ',
};
const KEEP = new Set(['\u2013', '\u2014', '\u00B7']);
/** Make text safe for the WinAnsi Helvetica subset used by both formats. */
export function sanitize(input: string): string {
  let out = '';
  for (const ch of String(input ?? '').normalize('NFC')) {
    if (FIX[ch] !== undefined) out += FIX[ch];
    else if (KEEP.has(ch) || (ch >= ' ' && ch <= '~')) out += ch;
    else {
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const c of base) if (c >= ' ' && c <= '~') out += c;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

const norm = (s: string) => sanitize(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 2));
function overlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let c = 0;
  for (const t of ta) if (tb.has(t)) c++;
  return c / Math.min(ta.size, tb.size);
}
const nearDup = (a: string, b: string) => {
  const na = norm(a), nb = norm(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na) || overlap(a, b) >= 0.7);
};

/** Drops highlights contained in / near-identical to the summary or to an earlier highlight. */
export function dedupeHighlights(highlights: string[], summary: string): string[] {
  const kept: string[] = [];
  for (const h of highlights) {
    const clean = sanitize(h);
    if (!clean || nearDup(clean, summary) || kept.some((k) => nearDup(k, clean))) continue;
    kept.push(clean);
  }
  return kept;
}

export function firstSentence(text: string): string {
  const t = sanitize(text);
  const m = /^.*?[.!?](?=\s|$)/.exec(t);
  return m ? m[0] : t;
}
/** Shorten at a word boundary; never mid-word. */
export function shorten(text: string, max: number): string {
  const t = sanitize(text);
  // A few characters over the budget read better whole than cut off.
  if (t.length <= Math.ceil(max * 1.1)) return t;
  const cut = t.slice(0, max + 1);
  const sp = cut.lastIndexOf(' ');
  // Prefer ending at a clause boundary when that keeps most of the text.
  const clause = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '));
  let s = (clause >= max * 0.6 ? cut.slice(0, clause) : sp > 0 ? cut.slice(0, sp) : t.slice(0, max)).replace(/[\s,;:\-–—(]+$/, '');
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/\s+(?:and|or|to|the|of|in|for|with|within|a|an|from|on|by|as|at|into|via|using|that|which|while)$/i, '').replace(/[\s,;:\-–—(&+]+$/, ''); }
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}
function sentences(text: string, n: number): string {
  const parts = sanitize(text).match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [];
  return parts.slice(0, n).join(' ').trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(v: string | null | undefined): string {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(v ?? '');
  if (!m) return '';
  const mo = m[2] ? MONTHS[Number(m[2]) - 1] : '';
  return mo ? `${mo} ${m[1]}` : m[1];
}
const range = (a: string, b: string | null) => `${fmtDate(a)} \u2013 ${b ? fmtDate(b) : 'Present'}`;
const join = (...p: (string | undefined)[]) => p.map((x) => sanitize(x ?? '')).filter(Boolean).join(', ');
const R = (text: string, bold = false): Run => ({ text: (/^ /.test(text) ? ' ' : '') + sanitize(text) + (/ $/.test(text) ? ' ' : ''), bold });
const dedupeStrings = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map(sanitize).filter((x) => x && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
};
const url = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

export const SECTION_HEADINGS = ['Summary', 'Core Skills', 'Professional Experience', 'Selected Projects', 'Certifications', 'Awards', 'Education'] as const;

export function buildBlocks(profile: Profile, tier: Tier): ResumeBlock[] {
  const b: ResumeBlock[] = [];
  const h = (t: string) => b.push({ kind: 'heading', runs: [R(t, true)] });
  const { identity, contact } = profile;
  b.push({ kind: 'name', runs: [R(identity.name, true)] });
  const head = dedupeStrings(identity.titles.length ? identity.titles : [identity.headline]).join(' | ');
  if (head) b.push({ kind: 'headline', runs: [R(head, true)] });
  const cr: Run[] = [];
  const sep = () => cr.push(R(' \u00B7 '));
  const add = (r: Run) => { if (cr.length) sep(); cr.push(r); };
  if (identity.region) add(R(identity.region));
  if (contact.phone) add(R(contact.phone));
  if (contact.email) add({ ...R(contact.email), href: `mailto:${sanitize(contact.email)}` });
  if (contact.linkedin) add({ ...R(contact.linkedin), href: url(sanitize(contact.linkedin)) });
  if (cr.length) b.push({ kind: 'contact', runs: cr });

  const summary = sentences(profile.summary, tier.summarySentences);
  const hl = tier.highlights ? dedupeHighlights(profile.highlights, summary) : [];
  if (summary || hl.length) {
    h('Summary');
    if (summary) b.push({ kind: 'para', runs: [R(summary)] });
    for (const x of hl) b.push({ kind: 'bullet', runs: [R(x)] });
  }

  const groups = new Map<string, { name: string; level: number }[]>();
  const seenSkill = new Set<string>();
  for (const s of profile.skills) {
    const name = sanitize(s.name);
    if (!name || seenSkill.has(name.toLowerCase())) continue;
    seenSkill.add(name.toLowerCase());
    const g = sanitize(s.group) || 'Other';
    groups.set(g, [...(groups.get(g) ?? []), { name, level: s.level }]);
  }
  const domains = dedupeStrings(profile.domains);
  if (groups.size || domains.length) {
    h('Core Skills');
    const ordered = [...groups.entries()].map(([g, xs]) => [g, [...xs].sort((a, c) => c.level - a.level)] as const);
    ordered.sort((a, c) => c[1][0].level - a[1][0].level);
    for (const [g, xs] of ordered) b.push({ kind: 'para', runs: [R(`${g}: `, true), R(xs.map((x) => x.name).join(', '))] });
    if (domains.length) b.push({ kind: 'para', runs: [R('Domain expertise: ', true), R(domains.join(', '))] });
  }

  if (profile.experience.length) {
    h('Professional Experience');
    const exp = [...profile.experience].sort((a, c) => (c.start > a.start ? 1 : c.start < a.start ? -1 : 0));
    for (const e of exp) {
      b.push({ kind: 'title', runs: [R(e.role, true), R(` \u2014 ${join(e.company, e.location)}`)], date: range(e.start, e.end) });
    }
  }

  const projects = profile.projects.slice(0, tier.maxProjects);
  if (projects.length) {
    h('Selected Projects');
    for (const p of projects) {
      b.push({ kind: 'title', runs: [R(p.domain ? `${p.name} \u2014 ${p.domain}` : p.name, true)] });
      const sum = p.summary ? shorten(firstSentence(p.summary), tier.summaryChars) : '';
      if (sum) b.push({ kind: 'para', runs: [R(sum)] });
      const tech = dedupeStrings(p.techStack).slice(0, tier.tech);
      if (tech.length) b.push({ kind: 'para', runs: [R('Tech: ', true), R(tech.join(', '))] });
      let n = 0;
      for (const r of p.roles) {
        if (n >= tier.bullets) break;
        const d = shorten(firstSentence(r.description) || r.description, tier.bulletChars);
        if (d && sum && nearDup(d, sum)) continue;
        b.push({ kind: 'bullet', runs: [R(`${r.title}: `, true), R(d)] });
        n++;
      }
    }
  }

  if (profile.certifications.length) {
    h('Certifications');
    for (const c of profile.certifications) {
      const tail = join(c.issuer, c.validUntil ? `valid until ${fmtDate(c.validUntil)}` : '');
      b.push({ kind: 'bullet', runs: [R(c.name, true), ...(tail ? [R(` \u2014 ${tail}`)] : [])] });
    }
  }

  const awardSeen = new Set<string>();
  const awards = profile.awards.filter((a) => {
    if (profile.certifications.some((c) => nearDup(c.name, a.title))) return false;
    const key = norm(`${a.title} ${a.date ?? ''} ${a.description}`);
    if (awardSeen.has(key)) return false;
    awardSeen.add(key);
    return true;
  }).slice(0, tier.maxAwards);
  if (awards.length) {
    h('Awards');
    for (const a of awards) {
      const d = fmtDate(a.date);
      const desc = tier.awardDesc && a.description ? shorten(firstSentence(a.description), 140) : '';
      b.push({ kind: 'bullet', runs: [R(d ? `${a.title} (${d})` : a.title, true), ...(desc ? [R(` \u2014 ${desc}`)] : [])] });
    }
  }

  if (profile.education.length) {
    h('Education');
    for (const e of profile.education) {
      const yrs = [e.start, e.end].map((x) => /^\d{4}/.exec(x ?? '')?.[0]).filter(Boolean).join(' \u2013 ');
      b.push({ kind: 'title', runs: [R(e.level, true), R(` \u2014 ${join(e.institution, e.location)}`)], date: yrs || undefined });
    }
  }
  return b;
}




