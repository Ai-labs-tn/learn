import type { Profile } from '../portfolio/types';
import type { StyleId } from './look';
import { REG } from './widths';

export type Run = { text: string; bold?: boolean; href?: string };
/** One paragraph of the resume, in terms of the template's paragraph styles. */
export type Para = {
  style: StyleId;
  runs: Run[];
  /** Direct "space after" in twips at spacing 1.0 (project detail paragraphs); scaled by the tier's spacing. */
  after?: number;
};

export type Tier = {
  index: number;
  name: string;
  /** Body font size in pt; every template size scales by body / template body size. */
  body: number;
  spacing: number;
  bullets: number;
  bulletChars: number;
  summaryChars: number;
  tech: number;
  highlights: boolean;
  dedupeRoles: boolean;
  maxProjects: number;
  maxAwards: number;
};

export const MIN_BODY = 9.5;
const BASE = { dedupeRoles: false, maxProjects: 99, maxAwards: 99, highlights: true };
const LADDER: Omit<Tier, 'index' | 'name'>[] = [
  { ...BASE, body: 11, spacing: 1, bullets: 3, bulletChars: 220, summaryChars: 220, tech: 12 },
  { ...BASE, body: 11, spacing: 0.9, bullets: 2, bulletChars: 200, summaryChars: 200, tech: 10 },
  { ...BASE, body: 10.5, spacing: 0.9, bullets: 2, bulletChars: 180, summaryChars: 200, tech: 10 },
  { ...BASE, body: 10.5, spacing: 0.8, bullets: 2, bulletChars: 160, summaryChars: 180, tech: 8 },
  { ...BASE, body: 10, spacing: 0.8, bullets: 1, bulletChars: 160, summaryChars: 180, tech: 8, dedupeRoles: true },
  { ...BASE, body: 10, spacing: 0.7, bullets: 1, bulletChars: 140, summaryChars: 160, tech: 8, dedupeRoles: true },
  { ...BASE, body: 9.5, spacing: 0.7, bullets: 1, bulletChars: 140, summaryChars: 160, tech: 8, dedupeRoles: true },
  { ...BASE, body: 9.5, spacing: 0.6, bullets: 1, bulletChars: 120, summaryChars: 160, tech: 8, dedupeRoles: true },
  { ...BASE, body: 9.5, spacing: 0.5, bullets: 1, bulletChars: 120, summaryChars: 160, tech: 8, dedupeRoles: true },
  { ...BASE, body: 9.5, spacing: 0.5, bullets: 0, bulletChars: 120, summaryChars: 160, tech: 8, dedupeRoles: true },
  { ...BASE, body: 9.5, spacing: 0.5, bullets: 0, bulletChars: 120, summaryChars: 160, tech: 6, dedupeRoles: true },
];
export const TIER_COUNT = LADDER.length;

/** Ladder tiers (richest first), then truncation tiers that drop lowest-priority content (awards, oldest projects). */
export function tierAt(i: number): Tier {
  if (i < LADDER.length) return { ...LADDER[i], index: i, name: `T${i + 1}` };
  const k = i - LADDER.length + 1;
  return { ...LADDER[LADDER.length - 1], index: i, name: `T${LADDER.length}-trim${k}`, maxProjects: Math.max(0, 10 - k), maxAwards: Math.max(0, 11 - k) };
}
export const MAX_TIER_INDEX = LADDER.length + 11;

const FIX: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2212': '-', '\u2026': '...', '\u2009': ' ', '\u200B': '', '\u00AD': '',
  '\u2192': '->', '\u2022': '', '\t': ' ', '\n': ' ', '\r': ' ',
};
/** Characters Caladea/Cambria render (and the width tables cover); everything else is mapped or dropped. */
export const supported = (ch: string): boolean => REG[ch.codePointAt(0)!] !== undefined;
export function sanitize(input: string): string {
  const s = String(input ?? '');
  if (s.includes('\u00A0')) return s.split(/(\u00A0)/).map((x) => (x === '\u00A0' ? x : sanitizeInner(x))).join('');
  return sanitizeInner(s);
}
function sanitizeInner(input: string): string {
  let out = '';
  for (const ch of String(input ?? '').normalize('NFC')) {
    if (FIX[ch] !== undefined) out += FIX[ch];
    else if (supported(ch)) out += ch;
    else {
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const c of base) if (supported(c)) out += c;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

const norm = (s: string) => sanitize(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  const re = /[.!?](?=\s|$)/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    // skip abbreviations such as "U.S." or "e.g."
    if (m[0] === '.' && /(?:^|[\s.(])[A-Za-z]$/.test(t.slice(0, m.index))) continue;
    return t.slice(0, m.index + 1);
  }
  return t;
}
/** The first full sentence if it fits, else the leading ';'-separated clauses that fit; '' when nothing complete fits. Never cuts mid-thought. */
export function whole(text: string, max: number): string {
  const s = firstSentence(text);
  if (!s) return '';
  if (s.length <= max) return s;
  const parts = s.replace(/[.!?]$/, '').split(/;\s+/);
  let out = '';
  for (const p of parts) {
    const next = out ? `${out}; ${p}` : p;
    if (next.length + 1 > max) break;
    out = next;
  }
  return out && out !== parts.join('; ') ? `${out}.` : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(v: string | null | undefined): string {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(v ?? '');
  if (!m) return '';
  const mo = m[2] ? MONTHS[Number(m[2]) - 1] : '';
  return mo ? `${mo} ${m[1]}` : m[1];
}
const range = (a: string | null | undefined, b: string | null | undefined, open: boolean) => {
  const from = fmtDate(a), to = b ? fmtDate(b) : open ? 'Present' : '';
  // Each month-year (and the space before the dash) is non-breaking; Word may still wrap after the en dash itself.
  const nb = (s: string) => s.replace(/ /g, '\u00A0');
  return from && to ? `${nb(from)}\u00A0\u2013 ${nb(to)}` : nb(from || to);
};
const pipe = (...p: (string | undefined)[]) => p.map((x) => sanitize(x ?? '')).filter(Boolean).join(' | ');
const comma = (...p: (string | undefined)[]) => p.map((x) => sanitize(x ?? '')).filter(Boolean).join(', ');
const R = (text: string, bold = false): Run => ({ text: (/^ /.test(text) ? ' ' : '') + sanitize(text) + (/ $/.test(text) ? ' ' : ''), bold });
const dedupeStrings = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map(sanitize).filter((x) => x && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
};
const stripProtocol = (s: string) => s.replace(/^https?:\/\//i, '').replace(/\/$/, '');
const url = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

export const SECTION_HEADINGS = ['Profile', 'Experience', 'Projects', 'Skills & Abilities', 'Certifications', 'Awards', 'Education', 'Activities and Interests'] as const;
const PROJECT_AFTER_TW = 40;
const TECH_AFTER_TW = 140;

export function buildBlocks(profile: Profile, tier: Tier): Para[] {
  const b: Para[] = [];
  const add = (style: StyleId, runs: Run[], after?: number) => b.push({ style, runs, after });
  const h1 = (t: string) => add('Heading1', [R(t)]);
  const bullet = (...runs: Run[]) => add('ListBullet', runs);
  const { identity, contact } = profile;

  add('Title', [R(identity.name)]);
  const headline = (identity.headline ? identity.headline.split(/\s*[\u00B7|]\s*/) : identity.titles).map(sanitize).filter(Boolean);
  if (headline.length) add('Contact', [R(headline.map((h) => h.replace(/ /g, '\u00A0')).join(' | '), true)], 0);
  const cr: Run[] = [];
  const part = (r: Run) => { if (cr.length) cr.push(R(' | ')); cr.push(r); };
  if (identity.region) part(R(identity.region));
  if (contact.phone) part(R(contact.phone));
  if (contact.email) part({ ...R(contact.email), href: `mailto:${sanitize(contact.email)}` });
  if (contact.linkedin) part({ ...R(stripProtocol(sanitize(contact.linkedin))), href: url(sanitize(contact.linkedin)) });
  if (contact.website) part({ ...R(stripProtocol(sanitize(contact.website))), href: url(sanitize(contact.website)) });
  if (cr.length) add('Contact', cr);

  const summary = sanitize(profile.summary);
  const hl = tier.highlights ? dedupeHighlights(profile.highlights, summary) : [];
  if (summary || hl.length) {
    h1('Profile');
    if (summary) add('Normal', [R(summary)]);
    for (const x of hl) bullet(R(x));
  }

  if (profile.experience.length) {
    h1('Experience');
    const exp = [...profile.experience].sort((a, c) => (c.start > a.start ? 1 : c.start < a.start ? -1 : 0));
    for (const e of exp) {
      add('Heading2', [R(pipe(e.role, e.company, range(e.start, e.end, true)))]);
      for (const a of dedupeStrings(e.achievements ?? [])) bullet(R(a));
    }
  }

  const projects = profile.projects.slice(0, tier.maxProjects);
  if (projects.length) {
    h1('Projects');
    const seenRole = new Set<string>();
    for (const p of projects) {
      add('Heading2', [R(pipe(p.name, p.domain))]);
      const sum = sanitize(p.short ?? '') || (p.summary ? whole(p.summary, tier.summaryChars) : '');
      if (sum) add('Normal', [R(sum)], PROJECT_AFTER_TW);
      const tech = dedupeStrings(p.techStack).slice(0, tier.tech);
      if (tech.length) add('Normal', [R('Tech: ', true), R(tech.join(', '))], TECH_AFTER_TW);
      let n = 0;
      for (const r of p.roles) {
        if (n >= tier.bullets) break;
        const d = whole(r.description, tier.bulletChars);
        if (!d) continue;
        if (d && sum && nearDup(d, sum)) continue;
        if (tier.dedupeRoles && d) {
          const key = norm(d);
          if (seenRole.has(key)) continue;
          seenRole.add(key);
        }
        bullet(R(`${r.title}: `, true), R(d));
        n++;
      }
    }
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
    h1('Skills & Abilities');
    const ordered = [...groups.entries()].map(([g, xs]) => [g, [...xs].sort((a, c) => c.level - a.level)] as const);
    ordered.sort((a, c) => c[1][0].level - a[1][0].level);
    for (const [g, xs] of ordered) bullet(R(`${g}: `, true), R(xs.map((x) => x.name).join(', ')));
    if (domains.length) bullet(R('Domain expertise: ', true), R(domains.join(', ')));
  }

  if (profile.certifications.length) {
    h1('Certifications');
    for (const c of profile.certifications) {
      const tail = comma(c.issuer, c.validUntil ? `valid until ${fmtDate(c.validUntil)}` : '');
      bullet(R(c.name, true), ...(tail ? [R(` \u2013 ${tail}`)] : []));
    }
  }

  const bullets = profile.experience.flatMap((e) => e.achievements ?? []).map((x) => sanitize(x).toLowerCase());
  const inBullets = (a: { title: string; date: string | null }) => {
    const t = sanitize(a.title).toLowerCase(), d = fmtDate(a.date).toLowerCase();
    return !!d && bullets.some((x) => x.includes(t) && x.includes(d));
  };
  const awardSeen = new Set<string>();
  const awards = profile.awards.filter((a) => {
    if (profile.certifications.some((c) => nearDup(c.name, a.title)) || inBullets(a)) return false;
    const key = norm(`${a.title} ${a.date ?? ''} ${a.description}`);
    if (awardSeen.has(key)) return false;
    awardSeen.add(key);
    return true;
  }).map((a, i) => ({ a, i })).sort((x, y) => (y.a.date ? 1 : 0) - (x.a.date ? 1 : 0) || (x.a.date && y.a.date ? (y.a.date > x.a.date ? 1 : y.a.date < x.a.date ? -1 : 0) : 0) || x.i - y.i)
    .map((x) => x.a).slice(0, tier.maxAwards);
  if (awards.length) {
    h1('Awards');
    for (const a of awards) {
      const d = fmtDate(a.date);
      const desc = a.description ? whole(a.description, 240) : '';
      bullet(R(d ? `${a.title} (${d})` : a.title, true), ...(desc ? [R(` \u2013 ${desc}`)] : []));
    }
  }

  if (profile.education.length) {
    h1('Education');
    for (const e of profile.education) {
      // The city is dropped when it would push the date onto a second line (heading is upper-cased, bold, 12pt).
      const dates = range(e.start, e.end, false);
      const full = pipe(e.level, comma(e.institution, (e.location ?? '').split(',')[0]), dates);
      add('Heading2', [R(full.length > 78 ? pipe(e.level, e.institution, dates) : full)]);
    }
  }

  const interests = dedupeStrings(profile.interests ?? []);
  if (interests.length) {
    h1('Activities and Interests');
    for (const i of interests) bullet(R(i));
  }
  return b;
}
