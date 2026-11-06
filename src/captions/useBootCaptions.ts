import { useEffect, useState } from 'react';
import { ApiError, request } from '../auth/api';
import { readPublished, type LessonDocument } from '../lessons/types';
import { BASELINE, readCaptionDocument } from './model';

/** Pin captions for this mounted scene; later publications never hot-swap active playback. */
export function useBootCaptions(baseline: LessonDocument = BASELINE) {
  const [document, setDocument] = useState<LessonDocument>(baseline);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = readPublished(await (await request(`/api/lessons/${encodeURIComponent(baseline.id)}`, { signal: controller.signal })).json());
        const next = readCaptionDocument(result.document, baseline);
        if (!controller.signal.aborted) setDocument(next);
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 404)) {
          setNotice('Published caption updates could not be loaded. The bundled baseline is shown; reload to retry.');
        }
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
  }, [baseline]);
  return { document, notice, ready };
}
