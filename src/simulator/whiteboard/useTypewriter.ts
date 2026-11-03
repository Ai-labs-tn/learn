import { useEffect, useState } from 'react';

/**
 * Reveal text character by character — the presenter "speaks" the caption.
 * Respects prefers-reduced-motion by returning the full text instantly.
 */
export function useTypewriter(text: string, speedMs = 16): string {
  const [count, setCount] = useState(text.length);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setCount(text.length);
      return undefined;
    }
    setCount(0);
    if (!text) return undefined;
    const timer = window.setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [text, speedMs]);

  return text.slice(0, count);
}