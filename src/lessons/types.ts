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

/** The server validates authoritative content. Still reject incompatible/corrupt API payloads here. */
export function readPublished(value: unknown): PublishedLesson {
  const data = value as PublishedLesson | null;
  const document = data?.document;
  const targets = ['power', 'firmware', 'cpu', 'ram', 'storage', 'overview'];
  if (!document || document.schemaVersion !== 1 || typeof document.id !== 'string' ||
      typeof document.title !== 'string' || typeof document.description !== 'string' ||
      !Number.isInteger(data?.revision) || !Array.isArray(document.scenes) || !document.scenes.length) {
    throw new Error('Unsupported lesson format.');
  }
  for (const scene of document.scenes) {
    if (typeof scene.id !== 'string' || typeof scene.title !== 'string' || !Array.isArray(scene.beats) || !scene.beats.length) throw new Error('Invalid lesson scene.');
    for (const beat of scene.beats) {
      if (typeof beat.id !== 'string' || typeof beat.narration?.en !== 'string' || typeof beat.narration?.ta !== 'string' ||
          beat.visual?.component !== 'boot-machine' || !targets.includes(beat.visual.focus) ||
          !['focus', 'signal', 'status'].includes(beat.visual.action)) throw new Error('Invalid lesson beat.');
    }
  }
  return data;
}
