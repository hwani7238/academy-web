'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-auth';

export function ManagementAccess({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'allowed' | 'signed-out' | 'denied' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false, version = 0;
    const off = onAuthStateChanged(auth, async user => {
      const requestVersion = ++version;
      setState(user ? 'loading' : 'signed-out');
      if (!user) return;
      try {
        const response = await fetch('/api/operations/access', { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        if (!stopped && version === requestVersion) setState(response.ok ? 'allowed' : response.status === 401 ? 'signed-out' : response.status === 403 ? 'denied' : 'error');
      } catch { if (!stopped && version === requestVersion) setState('error'); }
    });
    return () => { stopped = true; version++; off(); };
  }, [revision]);
  if (state === 'allowed') return children;
  return <main className="mx-auto my-20 max-w-lg space-y-5 rounded-xl border p-8"><p className="text-sm font-bold text-blue-700">WHEE MUSIC</p><h1 className="text-2xl font-bold">관리자 전용</h1>
    {state === 'loading' ? <p role="status">관리자 권한을 확인하고 있습니다.</p> : state === 'signed-out' ? <><p>관리자 계정으로 로그인해주세요.</p><a className="inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="/login">관리자 로그인</a></> : state === 'denied' ? <><p role="alert">이 계정은 출석·수납 관리에 접근할 수 없습니다.</p><p>피아노 강사는 위뮤직 홈페이지에서 오늘 출석을 조회할 수 있습니다.</p><a className="inline-block rounded-lg bg-blue-700 px-4 py-2 text-white" href="https://wheemusic.com/teacher/attendance">강사용 오늘 출석</a><button className="block text-sm underline" onClick={() => void signOut(auth)}>다른 계정으로 로그인</button></> : <><p role="alert">권한을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.</p><button className="rounded-lg border px-4 py-2" onClick={() => setRevision(value => value + 1)}>다시 확인</button></>}
  </main>;
}
