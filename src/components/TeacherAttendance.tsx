'use client';

import Link from 'next/link';
import { TeacherArrivalDialog } from './TeacherArrivalDialog';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { koreaDay, type PianoArrival, type PianoAttendance } from '@/lib/teacher-attendance';

const clock = (value: string) => value ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '시간 미확인';

export function TeacherAttendance() {
  const [data, setData] = useState<PianoAttendance | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready' | 'denied'>('loading');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<{row?:PianoArrival}|null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');

  useEffect(() => {
    let stopped = false, version = 0, running = false;
    let current = auth.currentUser;
    let controller: AbortController | undefined;
    async function load() {
      if (!current || stopped || running || document.visibilityState !== 'visible') return;
      running = true;
      const user = current, requestVersion = version;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 15000);
      setBusy(true);
      setData(previous => previous?.day === koreaDay() ? previous : null);
      try {
        const response = await fetch('/api/teacher/attendance', { cache: 'no-store', signal: requestController.signal, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const result = await response.json();
        if (stopped || requestVersion !== version) return;
        if (!response.ok) {
          if ([401, 403].includes(response.status)) { setData(null); setState(response.status === 401 ? 'signed-out' : 'denied'); }
          throw new Error(result.error || '출석 현황을 불러오지 못했습니다.');
        }
        setData(result); setError(''); setState('ready');
      } catch (reason) {
        if (!stopped && requestVersion === version) setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '연결이 지연되고 있습니다. 다시 새로고침해주세요.');
      } finally {
        clearTimeout(timeout);
        if (!stopped && requestVersion === version) { running = false; setBusy(false); }
      }
    }
    const off = onAuthStateChanged(auth, user => {
      version++; controller?.abort(); current = user; running = false;
      setData(null); setError(''); setEditor(null); setState(user ? 'loading' : 'signed-out');
      if (user) void load(); else setBusy(false);
    });
    const resume = () => { void load(); };
    const timer = setInterval(resume, 15000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => { stopped = true; version++; controller?.abort(); off(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); };
  }, [refresh]);

  const rows = (data?.arrivals || []).filter(row => row.name.includes(search.trim()) && (!course || row.course === course));
  const courses = [...new Set((data?.arrivals || []).map(row => row.course))].sort();
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-5 py-5"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-bold tracking-widest text-blue-700">WHEE MUSIC</p><h1 className="mt-1 text-2xl font-bold">오늘 출석 · 피아노</h1></div>
      <nav className="flex items-center gap-4 text-sm"><Link href="/admin" className="font-semibold text-blue-700">강사 업무</Link>{state !== 'signed-out' && <button onClick={() => void signOut(auth)}>로그아웃</button>}</nav>
    </div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-8">
      <p className="text-sm text-slate-600">피아노 전체 학생의 실제 등원 기록입니다. 시간을 누르면 수정할 수 있고, 늦게 기록하는 출석은 알림 없이 등록할 수 있습니다.</p>
      {state === 'signed-out' ? <section className="rounded-xl border bg-white p-6"><h2 className="text-lg font-bold">로그인이 필요합니다</h2><p className="mt-2 text-sm">승인된 피아노 강사 계정으로 로그인해주세요.</p><Link className="mt-4 inline-block rounded-lg bg-blue-700 px-5 py-2 text-white" href="/login">로그인</Link></section>
        : state === 'denied' ? <section role="alert" className="rounded-xl border bg-white p-6"><h2 className="font-bold">조회 권한이 없습니다</h2><p className="mt-2">승인된 피아노 강사와 관리자만 사용할 수 있습니다.</p><Link className="mt-4 inline-block text-blue-700" href="/admin">내 계정 상태 확인</Link></section>
        : <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"><div><h2 className="text-lg font-bold">{data?.day || koreaDay()} 출석 현황</h2><p className="mt-1 text-sm text-slate-600">{data ? `출석 ${data.arrivals.length}건 · 마지막 확인 ${clock(data.checkedAt)}` : '출석 현황을 확인하고 있습니다.'}</p></div><div className="flex gap-2">{state==='ready'&&<button disabled={!!editor} onClick={()=>{setMessage('');setEditor({});}} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">+ 출석 등록</button>}<button disabled={busy} onClick={() => setRefresh(value => value + 1)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? '확인 중…' : '새로고침'}</button></div></section>
          {message&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{error} {data && '아래 목록은 마지막으로 확인된 기록입니다.'}</p>}
          {data && <section className="overflow-hidden rounded-xl border bg-white">
            <div className="flex flex-wrap gap-4 border-b p-4"><label className="text-sm">학생 찾기<input value={search} onChange={event => setSearch(event.target.value)} placeholder="이름" className="ml-2 rounded-lg border px-3 py-2" /></label><label className="text-sm">과목<select value={course} onChange={event => setCourse(event.target.value)} className="ml-2 rounded-lg border px-3 py-2"><option value="">피아노 전체</option>{courses.map(value => <option key={value}>{value}</option>)}</select></label></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">오늘 피아노 출석 기록 · 출석 시간순</caption><thead className="bg-slate-50 text-slate-600"><tr>{['학생', '과목', '등원 시간', '상태'].map(label => <th className="whitespace-nowrap px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="whitespace-nowrap px-4 py-4 font-semibold">{row.name}</td><td className="px-4 py-4">{row.course}</td><td className="whitespace-nowrap px-4 py-4 tabular-nums">{<button aria-label={`${row.name} 등원 시간 수정`} onClick={()=>{setMessage('');setEditor({row});}} className="rounded-md px-2 py-1 font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:bg-blue-50">{clock(row.arrivalAt)}</button>}</td><td className="px-4 py-4"><span className="whitespace-nowrap rounded-full bg-blue-50 px-3 py-1 text-blue-700">{row.status === 'makeup' ? '보강 출석' : '출석'}</span>{row.source==='teacher'&&<span className="ml-2 text-xs text-slate-500">강사 확인</span>}</td></tr>)}</tbody></table></div>
            {!rows.length && <p role="status" className="p-10 text-center text-sm text-slate-500">{data.arrivals.length ? '검색 조건에 맞는 학생이 없습니다.' : '아직 오늘 출석한 피아노 학생이 없습니다.'}</p>}
          </section>}
        </>}
    </div>
    {editor&&data&&<TeacherArrivalDialog day={data.day} row={editor.row} close={()=>setEditor(null)} saved={message=>{setEditor(null);setMessage(message);setRefresh(value=>value+1);}}/>}
  </main>;
}
