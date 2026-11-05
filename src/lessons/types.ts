export type Language = 'en' | 'ta';
export type LocalizedText = Record<Language, string>;
export type VisualTarget = 'power' | 'firmware' | 'cpu' | 'ram' | 'storage' | 'overview';
export type LessonBeat = {
  id: string;
  narration: LocalizedText;
  captions?: Partial<LocalizedText>;
  visual: {
    component: 'boot-machine'; focus: VisualTarget; action: 'focus' | 'signal' | 'status';
    from?: VisualTarget; to?: VisualTarget; status?: 'idle' | 'checking' | 'passed';
  };
};
export type LessonDocument = {
  schemaVersion: 1; id: string; title: string; description: string;
  scenes: Array<{ id: string; title: string; beats: LessonBeat[] }>;
};
export type PublishedLesson = { document: LessonDocument; revision: number; publishedAt: string };
export type LessonSummary = { id: string; title: string; description: string; revision: number };
export const visualTargets: VisualTarget[] = ['power', 'firmware', 'cpu', 'ram', 'storage', 'overview'];
export const signalPairs: Array<[VisualTarget, VisualTarget]> = [
  ['power', 'firmware'], ['power', 'cpu'], ['firmware', 'cpu'], ['cpu', 'ram'],
  ['ram', 'cpu'], ['storage', 'ram'], ['cpu', 'storage'], ['storage', 'cpu'], ['cpu', 'firmware'],
];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid lesson object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unsupported lesson field.');
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max ||
      /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|\b[a-z][a-z0-9+.-]*:\/\/|\b(?:javascript|data|vbscript):|\bwww\./i.test(value)) {
    throw new Error('Use non-blank plain text within the field limits; markup, URLs and scripts are not supported.');
  }
}
/** Validate before rendering as well as before saving. The backend remains authoritative. */
export function readDocument(value: unknown): LessonDocument {
  const doc = record(value);
  keys(doc, ['schemaVersion', 'id', 'title', 'description', 'scenes']);
  const ids = new Set<string>();
  const id = (value: unknown) => {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value) || ids.has(value)) throw new Error('Lesson, scene and beat IDs must be unique lowercase slugs.');
    ids.add(value);
  };
  if (doc.schemaVersion !== 1) throw new Error('Unsupported lesson format.');
  id(doc.id); text(doc.title, 160); text(doc.description, 1000);
  if (!Array.isArray(doc.scenes) || doc.scenes.length < 1 || doc.scenes.length > 12) throw new Error('A lesson needs 1–12 scenes.');
  let count = 0;
  for (const value of doc.scenes) {
    const scene = record(value); keys(scene, ['id', 'title', 'beats']); id(scene.id); text(scene.title, 160);
    if (!Array.isArray(scene.beats) || scene.beats.length < 1 || scene.beats.length > 24) throw new Error('A scene needs 1–24 beats.');
    count += scene.beats.length;
    for (const value of scene.beats) {
      const beat = record(value); keys(beat, ['id', 'narration', 'captions', 'visual']); id(beat.id);
      const narration = record(beat.narration); keys(narration, ['en', 'ta']); text(narration.en, 2000); text(narration.ta, 2000);
      if ('captions' in beat) {
        const captions = record(beat.captions); keys(captions, ['en', 'ta']);
        if (!Object.keys(captions).length) throw new Error('Omit empty captions.');
        Object.values(captions).forEach((value) => text(value, 2000));
      }
      const v = record(beat.visual); keys(v, ['component', 'focus', 'action', 'from', 'to', 'status']);
      if (v.component !== 'boot-machine' || !visualTargets.includes(v.focus as VisualTarget)) throw new Error('Unsupported visual focus.');
      if (v.action === 'focus') {
        if ('from' in v || 'to' in v || 'status' in v) throw new Error('Focus does not accept signal or status fields.');
      } else if (v.action === 'signal') {
        if ('status' in v || !signalPairs.some(([from, to]) => v.from === from && v.to === to) || (v.focus !== v.from && v.focus !== v.to)) throw new Error('Choose a registered signal and endpoint focus.');
      } else if (v.action === 'status') {
        if (v.focus === 'overview' || !['idle', 'checking', 'passed'].includes(v.status as string) || 'from' in v || 'to' in v) throw new Error('Choose a physical focus and supported status.');
      } else throw new Error('Unsupported visual action.');
    }
  }
  if (count > 120 || new TextEncoder().encode(JSON.stringify(doc)).length > 262144) throw new Error('Lesson exceeds 120 beats or the 256 KiB limit.');
  return value as LessonDocument;
}
export function readPublished(value: unknown): PublishedLesson {
  const data = record(value);
  readDocument(data.document);
  if (!Number.isInteger(data.revision) || (data.revision as number) < 1 || typeof data.publishedAt !== 'string') throw new Error('Invalid publication metadata.');
  return value as PublishedLesson;
}
