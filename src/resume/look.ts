import { SPEC } from './template/spec';

export type StyleId = 'Title' | 'Contact' | 'Heading1' | 'Heading2' | 'ListBullet' | 'Normal';
export const STYLE_IDS: StyleId[] = ['Title', 'Contact', 'Heading1', 'Heading2', 'ListBullet', 'Normal'];

export type Look = {
  id: StyleId;
  /** Half-points, as written to styles.xml. */
  sz: number;
  beforeTw: number;
  afterTw: number;
  /** Line spacing multiple (w:line / 240). */
  lineMul: number;
  bold: boolean;
  caps: boolean;
  color: string;
  contextual: boolean;
  keepNext: boolean;
  keepLines: boolean;
};

export const tw2pt = (tw: number): number => tw / 20;
export const pt2tw = (pt: number): number => Math.round(pt * 20);

export const page = () => {
  const p = SPEC.page;
  return { width: tw2pt(p.width), height: tw2pt(p.height), left: tw2pt(p.left), right: tw2pt(p.right), top: tw2pt(p.top), bottom: tw2pt(p.bottom) };
};
export const contentWidth = (): number => page().width - page().left - page().right;
export const contentHeight = (): number => page().height - page().top - page().bottom;

/** Sizes and spacing are always the template's own; content levels never scale them. */
export function looks(): Record<StyleId, Look> {
  const out = {} as Record<StyleId, Look>;
  for (const id of STYLE_IDS) {
    const s = SPEC.styles[id];
    out[id] = {
      id, sz: Math.round(s.size * 2), beforeTw: s.before, afterTw: s.after, lineMul: s.line / 240,
      bold: s.bold, caps: s.caps, color: s.color, contextual: s.contextual, keepNext: s.keepNext, keepLines: s.keepLines,
    };
  }
  return out;
}
export const sizePt = (l: Look): number => l.sz / 2;
export const footerSz = (): number => Math.round(SPEC.styles.Footer.size * 2);
