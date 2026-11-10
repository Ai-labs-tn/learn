import type { Profile } from '../portfolio/types';
import { sanitize } from './model';
import { THEME } from './theme';

export const hexRgb = (hex: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

export function resumeFilename(profile: Profile, format: 'docx' | 'pdf'): string {
  const base = sanitize(profile.identity.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Profile';
  return `${base}_Resume.${format}`;
}
export const topSkills = (profile: Profile, n = 8): string[] =>
  [...profile.skills].sort((a, b) => b.level - a.level).slice(0, n).map((s) => sanitize(s.name)).filter(Boolean);
export const docTitle = (profile: Profile): string => `${sanitize(profile.identity.name) || 'Profile'} \u2013 Resume`;
export { THEME };
