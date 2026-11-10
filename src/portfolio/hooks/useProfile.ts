import { useEffect, useState } from 'react';
import { request } from '../../auth/api';
import snapshot from '../profile.snapshot.json';
import { normalizeEnvelope, type ProfileEnvelope } from '../types';

const FALLBACK: ProfileEnvelope = normalizeEnvelope(snapshot) ?? {
  profileId: '', version: 0, updatedAt: '',
  profile: {
    identity: { name: 'Portfolio', headline: '', titles: [], region: '' },
    contact: { email: '', linkedin: '' }, summary: '', highlights: [], skills: [], certifications: [],
    awards: [], experience: [], education: [], projects: [], domains: [], interests: [],
  },
};

export function useProfile(): ProfileEnvelope {
  const [envelope, setEnvelope] = useState<ProfileEnvelope>(FALLBACK);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await request('/api/profile', { timeoutMs: 8000, signal: controller.signal });
        const next = normalizeEnvelope(await response.json());
        if (!next) return;
        setEnvelope((current) =>
          next.version !== current.version || next.updatedAt > current.updatedAt ? next : current);
      } catch {
        /* keep the snapshot silently */
      }
    })();
    return () => controller.abort();
  }, []);
  return envelope;
}
