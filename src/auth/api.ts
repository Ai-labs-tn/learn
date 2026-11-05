export type Session = {
  user: { username: string; role: 'admin' | 'guest' };
  csrfToken: string;
};

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed (${status}).`);
  }
}

export async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

export async function readSession(path: string, init?: RequestInit): Promise<Session> {
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
