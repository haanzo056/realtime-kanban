export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'kanban.token';
const USER_KEY = 'kanban.user';

export interface Session {
  token: string;
  user: { id: string; name: string };
}

export function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  if (!token || !user) return null;
  try {
    return { token, user: JSON.parse(user) };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new Error(body.error ?? `request failed (${res.status})`);
  }
  return body as T;
}

export function login(name: string) {
  return request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ name }) });
}

export interface BoardSummary {
  id: string;
  title: string;
  revision: number;
}

export function listBoards(token: string) {
  return request<{ boards: BoardSummary[] }>('/boards', { token });
}

export function createBoard(token: string, title: string) {
  return request<{ board: BoardSummary }>('/boards', {
    method: 'POST',
    token,
    body: JSON.stringify({ title }),
  });
}
