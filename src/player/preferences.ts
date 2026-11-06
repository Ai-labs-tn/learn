import { useSyncExternalStore } from 'react';
export type PlayerPreferences = { language: 'en' | 'ta'; voice: boolean; subtitles: boolean; rate: 1 | 1.5 | 2 };
const KEY = 'learn.player.preferences';
const defaults: PlayerPreferences = { language: 'en', voice: false, subtitles: true, rate: 1 };
function read(): PlayerPreferences {
  try {
    if (typeof window === 'undefined') return defaults;
    const raw = localStorage.getItem(KEY);
    const value = raw ? JSON.parse(raw) : {
      language: JSON.parse(localStorage.getItem('learn.captionLang') ?? '"en"'),
      voice: JSON.parse(localStorage.getItem('learn.voice') ?? 'false'),
      rate: JSON.parse(localStorage.getItem('learn.pace') ?? '1'),
    };
    return {
      language: value.language === 'ta' ? 'ta' : 'en',
      voice: typeof value.voice === 'boolean' ? value.voice : defaults.voice,
      subtitles: typeof value.subtitles === 'boolean' ? value.subtitles : defaults.subtitles,
      rate: [1, 1.5, 2].includes(value.rate) ? value.rate : 1,
    };
  } catch { return defaults; }
}
let snapshot = read();
const listeners = new Set<() => void>();
function changed() { for (const listener of listeners) listener(); }
function storage(event: StorageEvent) {
  if (event.key === KEY || event.key === null) { snapshot = read(); changed(); }
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', storage);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', storage); };
}
export function usePlayerPreferences() {
  const preferences = useSyncExternalStore(subscribe, () => snapshot, () => defaults);
  const updatePreferences = (patch: Partial<PlayerPreferences>) => {
    snapshot = { ...snapshot, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* session-only when storage is blocked */ }
    changed();
  };
  return { preferences, updatePreferences };
}
