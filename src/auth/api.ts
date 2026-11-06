export type Session = {
  user: { username: string; role: 'admin' | 'guest' };
  csrfToken: string;
};

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed (${status}).`);
  }
}

/** The server did not answer in time (e.g. a sleeping free-tier instance still starting). */
export class RequestTimeoutError extends Error {
  constructor() {
    super('The server did not respond in time.');
  }
}

export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Same-origin request with a hard timeout. Uses setTimeout (not AbortSignal.timeout) so the
 * deadline is controllable in tests. A caller's own signal still cancels the request.
 */
export async function request(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal: callerSignal, ...rest } = init;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  callerSignal?.addEventListener('abort', cancel);
  let timedOut = false;
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(path, { ...rest, signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new ApiError(response.status);
    return response;
  } catch (error) {
    if (timedOut && !callerSignal?.aborted) throw new RequestTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
  }
}

export async function readSession(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Session> {
  const response = await request(path, init);
  const value = await response.json();
  if (
    typeof value?.user?.username !== 'string' ||
    !['admin', 'guest'].includes(value?.user?.role) ||
    typeof value?.csrfToken !== 'string' || !value.csrfToken
  ) {
    throw new Error('Invalid session response.');
  }
  return { user: { username: value.user.username, role: value.user.role }, csrfToken: value.csrfToken };
}
