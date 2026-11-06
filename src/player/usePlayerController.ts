import { useEffect, useRef, useState } from 'react';
import { usePlayerPreferences } from './preferences';
export type PlayerPanel = 'chapters' | 'settings' | 'explore' | 'info' | null;
export function usePlayerController({ playing, onPause, ready = true }: { playing: boolean; onPause: () => void; ready?: boolean }) {
  const { preferences, updatePreferences } = usePlayerPreferences();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState<PlayerPanel>(null);
  const [chrome, setChrome] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const root = useRef<HTMLElement>(null);
  const panelElement = useRef<HTMLDivElement>(null);
  const editorElement = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const hideTimer = useRef<number>();
  const live = useRef({ playing, panel, editing, onPause }); live.current = { playing, panel, editing, onPause };
  const wake = () => {
    setChrome(true); window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const state = live.current;
      const toolbar = root.current?.querySelector('[data-player-controls]');
      const focused = document.activeElement?.matches(':focus-visible') && (toolbar?.contains(document.activeElement) || editorElement.current?.contains(document.activeElement));
      if (state.playing && !state.panel && !state.editing && !focused && !toolbar?.matches(':hover')) setChrome(false);
    }, 3000);
  };
  useEffect(() => { wake(); return () => window.clearTimeout(hideTimer.current); }, [playing, panel, editing]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden); visibility();
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', changed); };
  }, []);
  useEffect(() => {
    if (!ready || !root.current) return;
    const resize = () => { const element = root.current; if (element) element.style.setProperty('--player-height', `${Math.max(240, window.innerHeight - element.getBoundingClientRect().top - 8)}px`); };
    resize(); window.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize); if (root.current.parentElement) observer.observe(root.current.parentElement);
    return () => { window.removeEventListener('resize', resize); observer.disconnect(); };
  }, [ready]);
  useEffect(() => { if (panel) panelElement.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [panel]);
  const openPanel = (next: PlayerPanel) => {
    if (editing) return;
    opener.current = document.activeElement as HTMLElement; onPause(); setPanel(next); setChrome(true);
  };
  const closePanel = () => { setPanel(null); setChrome(true); opener.current?.focus(); };
  const changeFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else throw new Error('Fullscreen unavailable');
    } catch { setFullscreenError('Fullscreen is unavailable in this browser. The player still works here.'); }
  };
  return { preferences, updatePreferences, editing, setEditing, hidden, panel, setPanel, chrome, setChrome, fullscreen, fullscreenError,
    root, panelElement, editorElement, wake, openPanel, closePanel, changeFullscreen };
}
export type PlayerController = ReturnType<typeof usePlayerController>;
