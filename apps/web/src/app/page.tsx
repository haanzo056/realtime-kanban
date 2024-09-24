'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  clearSession,
  createBoard,
  listBoards,
  loadSession,
  login,
  saveSession,
  type BoardSummary,
  type Session,
} from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!session) return;
    listBoards(session.token)
      .then((r) => setBoards(r.boards))
      .catch((e: Error) => {
        setError(e.message);
        setSession(loadSession());
      });
  }, [session]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const s = await login(name.trim());
      saveSession(s);
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !title.trim()) return;
    try {
      const { board } = await createBoard(session.token, title.trim());
      router.push(`/board/${board.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-8 text-2xl font-semibold">Kanban</h1>

      {error && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!session ? (
        <form onSubmit={onLogin} className="flex gap-2">
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">
            Sign in
          </button>
        </form>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between text-sm text-slate-600">
            <span>Signed in as {session.user.name}</span>
            <button
              className="underline"
              onClick={() => {
                clearSession();
                setSession(null);
              }}
            >
              Sign out
            </button>
          </div>

          <form onSubmit={onCreate} className="mb-8 flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              placeholder="New board title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">
              Create
            </button>
          </form>

          <ul className="divide-y divide-slate-200 rounded bg-white shadow-sm">
            {boards.length === 0 && <li className="px-4 py-3 text-slate-500">No boards yet</li>}
            {boards.map((b) => (
              <li key={b.id}>
                <Link href={`/board/${b.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
