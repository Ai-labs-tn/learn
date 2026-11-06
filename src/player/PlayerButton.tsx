import type { ReactNode } from 'react';
import s from './player.module.css';
export type PlayerIcon = 'previous' | 'play' | 'pause' | 'next' | 'replay' | 'sound' | 'muted' | 'captions' | 'chapters' | 'settings' | 'fullscreen' | 'close' | 'info' | 'explore' | 'power';
const icons: Record<PlayerIcon, ReactNode> = {
  previous: <><path d="M6 5v14M19 5l-9 7 9 7Z" /></>,
  next: <><path d="M18 5v14M5 5l9 7-9 7Z" /></>,
  play: <path d="m8 4 13 8-13 8Z" />,
  pause: <path d="M8 4v16M16 4v16" />,
  replay: <><path d="M4 9a8 8 0 1 1 0 7M4 3v6h6" /></>,
  sound: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" /></>,
  muted: <><path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6M22 9l-6 6" /></>,
  captions: <><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M10 9H6v6h4M19 9h-4v6h4" /></>,
  chapters: <><path d="M8 5h14M8 12h14M8 19h14M2 5h1M2 12h1M2 19h1" /></>,
  settings: <><path d="M4 2v20M12 2v20M20 2v20M1 8h6M9 16h6M17 6h6" /></>,
  fullscreen: <path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></>,
  explore: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6M10 6v8M6 10h8" /></>,
  power: <><path d="M12 2v10M6 5a9 9 0 1 0 12 0" /></>,
};
export function PlayerButton({ icon, label, onClick, disabled, pressed }: {
  icon: PlayerIcon; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean;
}) {
  return <button type="button" className={s.iconButton} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[icon]}</svg>
  </button>;
}
