'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Board } from '@/components/Board';
import { loadSession, type Session } from '@/lib/api';

export default function BoardPage({ params }: { params: { boardId: string } }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) router.replace('/');
    else setSession(s);
  }, [router]);

  if (!session) return null;
  return <Board boardId={params.boardId} session={session} />;
}
