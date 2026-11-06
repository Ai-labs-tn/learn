import type { Profile, Strength } from './types';

export const SECTION_IDS = {
  hero: 'top', about: 'about', skills: 'skills', experience: 'experience',
  projects: 'projects', recognition: 'recognition', education: 'education', contact: 'contact',
} as const;

export function firstSentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  return parts ? parts.slice(0, n).join('').trim() : text.trim();
}

export function monthYear(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function yearsOfExperience(profile: Profile, now = new Date()): number {
  const starts = profile.experience.map((e) => Date.parse(`${e.start.slice(0, 7)}-01T00:00:00Z`)).filter((t) => !Number.isNaN(t));
  if (!starts.length) return 0;
  return Math.max(0, Math.floor((now.getTime() - Math.min(...starts)) / (365.25 * 24 * 3600 * 1000)));
}

export function deriveStrengths(profile: Profile): Strength[] {
  const n = profile.narration?.strengths;
  if (n && n.length) return n.slice(0, 6);
  const groups = new Map<string, string[]>();
  for (const s of profile.skills) groups.set(s.group, [...(groups.get(s.group) ?? []), s.name]);
  return [...groups.entries()].slice(0, 4).map(([title, names]) => ({ title, text: names.join(', ') }));
}

export const projectStory = (profile: Profile, id: string, summary: string) =>
  profile.narration?.projectStories?.[id] || summary;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '•';
