import { useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { useInView } from '../hooks/motion';
import s from '../portfolio.module.css';

type Props = { as?: ElementType; i?: number; className?: string; side?: 'left' | 'right'; children: ReactNode };

export function Reveal({ as: Tag = 'div', i = 0, className = '', side, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref);
  const cls = [s.reveal, seen ? s.in : '', side === 'left' ? s.fromLeft : side === 'right' ? s.fromRight : '', className].filter(Boolean).join(' ');
  return <Tag ref={ref} className={cls} style={{ '--i': i } as CSSProperties}>{children}</Tag>;
}

export function SectionShell({ id, title, eyebrow, children }: { id: string; title: string; eyebrow: string; children: ReactNode }) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <div className={s.backdrop} aria-hidden="true" />
      <div className={s.container}>
        <Reveal className={s.sectionHead}>
          <p className={s.eyebrow}>{eyebrow}</p>
          <h2 id={`${id}-title`} className={s.h2}>{title}</h2>
        </Reveal>
        {children}
      </div>
    </section>
  );
}

export function Meter({ name, level }: { name: string; level: number }) {
  return (
    <span className={s.meter} role="img" aria-label={`${name}, level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= level ? s.segOn : s.seg} />)}
    </span>
  );
}
