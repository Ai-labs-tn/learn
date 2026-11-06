import baseline from './boot-whiteboard.v1.json' with { type: 'json' };
import { readDocument, type LessonDocument, type Language } from '../lessons/types';

export const CAPTION_LESSON = 'boot-whiteboard';
export const BASELINE = readDocument(baseline);
export const draftPath = `/api/studio/lessons/${CAPTION_LESSON}/draft`;
export const publishedPath = `/api/lessons/${CAPTION_LESSON}`;

/** Caption-only workflow: reject structural/visual changes, never silently discard them. */
export function readCaptionDocument(value: unknown): LessonDocument {
  const doc = readDocument(value);
  const skeleton = (document: LessonDocument) => ({ ...document, scenes: document.scenes.map(scene => ({
    ...scene, beats: scene.beats.map(({ narration: _n, captions: _c, ...beat }) => beat),
  })) });
  if (JSON.stringify(skeleton(doc)) !== JSON.stringify(skeleton(BASELINE))) {
    throw new Error('The saved lesson structure does not match this boot scene. Inline editing is blocked to protect existing content.');
  }
  if (doc.scenes[0].beats.some(beat => (['en', 'ta'] as const).some(language =>
    beat.captions?.[language] !== undefined && beat.captions[language] !== beat.narration[language]))) {
    throw new Error('Caption and narration overrides differ. Inline editing is blocked rather than publishing unseen narration changes.');
  }
  return doc;
}
export function captionText(doc: LessonDocument, step: string, language: Language): string {
  const beat = doc.scenes[0].beats.find(item => item.id === step);
  if (!beat) throw new Error('The caption step was not found.');
  return beat.captions?.[language] ?? beat.narration[language];
}
export function replaceCaption(doc: LessonDocument, step: string, language: Language, text: string) {
  const copy = structuredClone(doc);
  const beat = copy.scenes[0].beats.find(item => item.id === step);
  if (!beat) throw new Error('The caption step was not found.');
  beat.narration[language] = text;
  if (beat.captions?.[language] !== undefined) beat.captions[language] = text;
  return readCaptionDocument(copy);
}
export function changedCaptions(previous: LessonDocument, next: LessonDocument) {
  return next.scenes[0].beats.flatMap(beat => (['en', 'ta'] as const).flatMap(language => {
    const before = captionText(previous, beat.id, language), after = captionText(next, beat.id, language);
    return before === after ? [] : [{ step: beat.id, language, before, after }];
  }));
}
