import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseSimulatorResult<T> {
  steps: readonly T[];
  /** Index of the current snapshot. */
  index: number;
  /** The current snapshot. */
  current: T;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  /** 0–100 through the timeline. */
  progress: number;
  next: () => void;
  prev: () => void;
  reset: () => void;
  jumpTo: (index: number) => void;
  playing: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Milliseconds between automatic steps while playing. */
  speedMs: number;
  setSpeedMs: (ms: number) => void;
}

/**
 * The step pointer (PRD §2.4): the UI tracks a single `currentStepIndex` and animates to whichever
 * snapshot is current. The snapshots themselves never change — only this pointer moves.
 */
export function useSimulator<T>(steps: readonly T[], initialSpeedMs = 1400): UseSimulatorResult<T> {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(initialSpeedMs);
  const total = steps.length;

  const next = useCallback(() => setIndex((current) => Math.min(current + 1, total - 1)), [total]);
  const prev = useCallback(() => setIndex((current) => Math.max(current - 1, 0)), []);
  const reset = useCallback(() => {
    setIndex(0);
    setPlaying(false);
  }, []);
  const jumpTo = useCallback(
    (target: number) => setIndex(Math.max(0, Math.min(target, total - 1))),
    [total],
  );

  const atEnd = total === 0 || index >= total - 1;

  useEffect(() => {
    if (!playing || atEnd) {
      if (atEnd) setPlaying(false);
      return undefined;
    }
    const timer = window.setInterval(
      () => setIndex((current) => Math.min(current + 1, total - 1)),
      Math.max(200, speedMs),
    );
    return () => window.clearInterval(timer);
  }, [playing, speedMs, atEnd, total]);

  const progress = total > 1 ? (index / (total - 1)) * 100 : 100;

  return useMemo(
    () => ({
      steps,
      index,
      current: steps[index],
      total,
      atStart: index === 0,
      atEnd,
      progress,
      next,
      prev,
      reset,
      jumpTo,
      playing,
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      toggle: () => setPlaying((current) => !current),
      speedMs,
      setSpeedMs,
    }),
    [
      steps,
      index,
      total,
      atEnd,
      progress,
      next,
      prev,
      reset,
      jumpTo,
      playing,
      speedMs,
    ],
  );
}
