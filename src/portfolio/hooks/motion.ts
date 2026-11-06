import { useEffect, useRef, useState, type RefObject } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** True once the element has entered the viewport (one-shot). */
export function useInView<T extends Element>(ref: RefObject<T>, rootMargin = '0px 0px -10% 0px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin, threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, seen]);
  return seen;
}

export function useCountUp(target: number, active: boolean, reduced: boolean, duration = 1400): number {
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setValue(target); return; }
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduced, duration]);
  return value;
}

/** Writes --sy (scroll px) and --progress (0..1) on the root, rAF-throttled. */
export function useScrollVars(ref: RefObject<HTMLElement>, reduced: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const write = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.setProperty('--progress', String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
      if (!reduced) el.style.setProperty('--sy', String(Math.round(window.scrollY)));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(write); };
    write();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [ref, reduced]);
}

/** Pointer (or idle drift on touch) driving --px/--py on the scene while it is visible. */
export function useScenePointer(ref: RefObject<HTMLElement>, reduced: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    let visible = true;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (coarse) { tx = Math.sin(now / 4200) * 0.6; ty = Math.cos(now / 5300) * 0.4; }
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      el.style.setProperty('--px', cx.toFixed(3));
      el.style.setProperty('--py', cy.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      start();
    };
    const leave = () => { tx = 0; ty = 0; };
    const io = new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); if (visible) start(); });
    io.observe(el);
    if (!coarse) { el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave); }
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      io.disconnect();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', start);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, reduced]);
}

/** Pointer tilt for a card: max deg, writes --rx --ry --mx --my. Mouse/pen only. */
export function useTilt<T extends HTMLElement>(reduced: boolean, max = 8) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const r = el.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width;
      const y = (ev.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => { if (e.pointerType === 'touch') return; ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    const leave = () => {
      ev = null;
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); if (raf) cancelAnimationFrame(raf); };
  }, [reduced, max]);
  return ref;
}
