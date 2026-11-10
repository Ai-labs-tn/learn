export type Skill = { name: string; level: number; group: string };
export type Certification = { name: string; issuer: string; validUntil?: string };
export type Award = { title: string; date: string | null; description: string };
export type Experience = { id: string; role: string; company: string; location: string; start: string; end: string | null; achievements: string[] };
export type Education = { level: string; institution: string; location: string; start: string; end: string };
export type ProjectRole = { title: string; description: string };
export type Project = { id: string; name: string; domain: string; summary: string; short?: string; company?: string; techStack: string[]; roles: ProjectRole[] };
export type Strength = { title: string; text: string };
export type Narration = {
  tagline?: string;
  elevatorPitch?: string;
  about?: string;
  careerStory?: string;
  strengths?: Strength[];
  projectStories?: Record<string, string>;
};
export type Profile = {
  identity: { name: string; headline: string; titles: string[]; region: string };
  contact: { email: string; linkedin: string; phone?: string; website?: string; address?: string };
  summary: string;
  highlights: string[];
  skills: Skill[];
  certifications: Certification[];
  awards: Award[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  domains: string[];
  interests: string[];
  skillFocus?: { primary: string[]; secondary: string[] };
  narration?: Narration;
};
export type ProfileEnvelope = { profileId: string; version: number; updatedAt: string; profile: Profile };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** Tolerant normaliser: returns null only when the payload is not a usable profile at all. */
export function normalizeEnvelope(value: unknown): ProfileEnvelope | null {
  if (!isObj(value) || !isObj(value.profile)) return null;
  const p = value.profile;
  if (!isObj(p.identity) || !str(p.identity.name).trim()) return null;
  const contact = isObj(p.contact) ? p.contact : {};
  const n = isObj(p.narration) ? p.narration : undefined;
  const narration: Narration | undefined = n
    ? {
        tagline: str(n.tagline) || undefined,
        elevatorPitch: str(n.elevatorPitch) || undefined,
        about: str(n.about) || undefined,
        careerStory: str(n.careerStory) || undefined,
        strengths: list(n.strengths).map((s) => ({ title: str(s.title), text: str(s.text) })).filter((s) => s.title && s.text),
        projectStories: isObj(n.projectStories)
          ? Object.fromEntries(Object.entries(n.projectStories).filter(([, t]) => typeof t === 'string')) as Record<string, string>
          : undefined,
      }
    : undefined;
  const profile: Profile = {
    identity: {
      name: str(p.identity.name),
      headline: str(p.identity.headline),
      titles: strs(p.identity.titles),
      region: str(p.identity.region),
    },
    contact: { email: str(contact.email), linkedin: str(contact.linkedin), phone: /^\+?[0-9 ()-]{6,20}$/.test(str(contact.phone)) ? str(contact.phone) : undefined,
      website: /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[A-Za-z0-9._~%\/-]*)?$/.test(str(contact.website)) ? str(contact.website) : undefined, address: str(contact.address) || undefined },
    summary: str(p.summary),
    highlights: strs(p.highlights),
    skills: list(p.skills)
      .filter((s) => str(s.name))
      .map((s) => ({ name: str(s.name), level: Math.min(5, Math.max(1, Math.round(Number(s.level) || 1))), group: str(s.group, 'Other') })),
    certifications: list(p.certifications)
      .filter((c) => str(c.name))
      .map((c) => ({ name: str(c.name), issuer: str(c.issuer), validUntil: str(c.validUntil) || undefined })),
    awards: list(p.awards)
      .filter((a) => str(a.title))
      .map((a) => ({ title: str(a.title), date: str(a.date) || null, description: str(a.description) })),
    experience: list(p.experience)
      .filter((e) => str(e.role) && /^\d{4}-\d{2}/.test(str(e.start)))
      .map((e, i) => ({
        id: str(e.id, `exp-${i}`), role: str(e.role), company: str(e.company), location: str(e.location),
        start: str(e.start), end: str(e.end) || null, achievements: strs(e.achievements),
      })),
    education: list(p.education)
      .filter((e) => str(e.institution))
      .map((e) => ({ level: str(e.level), institution: str(e.institution), location: str(e.location), start: str(e.start), end: str(e.end) })),
    projects: list(p.projects)
      .filter((x) => str(x.name))
      .map((x, i) => ({
        id: str(x.id, `project-${i}`), name: str(x.name), domain: str(x.domain), summary: str(x.summary), short: str(x.short) || undefined, company: str(x.company) || undefined,
        techStack: strs(x.techStack),
        roles: list(x.roles).map((r) => ({ title: str(r.title), description: str(r.description) })).filter((r) => r.title),
      })),
    domains: strs(p.domains),
    interests: strs(p.interests),
    skillFocus: isObj(p.skillFocus) ? { primary: strs(p.skillFocus.primary), secondary: strs(p.skillFocus.secondary) } : undefined,
    narration,
  };
  return {
    profileId: str(value.profileId),
    version: typeof value.version === 'number' ? value.version : 0,
    updatedAt: str(value.updatedAt),
    profile,
  };
}
