'use client';

import Link from 'next/link';
import { AttendanceDateNav } from './AttendanceDateNav';
import { Clock3 } from 'lucide-react';
import { watchTeacherAttendance } from '@/lib/teacher-attendance-events';
import { TeacherArrivalDialog } from './TeacherArrivalDialog';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { compareTeacherAttendance, type TeacherAttendanceOrder, koreaDay, type TeacherArrival, type TeacherAttendanceData, type TeacherWaiting } from '@/lib/teacher-attendance';

const clock = (value: string) => value ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '시간 미기록';

export function TeacherAttendance() {
  const [snapshot, setData] = useState<TeacherAttendanceData | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'signed-out' | 'ready' | 'denied'>('loading');
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<{row?:TeacherArrival}|null>(null);
  const [message, setMessage] = useState('');
  const [selectedDay,setSelectedDay] = useState('');
  const [today,setToday] = useState(koreaDay());
  const [courseFilter,setCourseFilter] = useState('전체');
  const [order,setOrder] = useState<TeacherAttendanceOrder>('name');
  const day = selectedDay || today;
  const data = snapshot?.day === day ? snapshot : null;
  const viewingToday = day === today;
  const changeDay = (next:string) => {setEditor(null);setMessage('');setSelectedDay(next===today?'':next);};

  useEffect(() => {
    let stopped = false, version = 0, running = false, queued = false;
    let stopEvents: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined, retryDelay = 1000;
    let current = auth.currentUser;
    let controller: AbortController | undefined;
    async function load() {
      if (!current || stopped || document.visibilityState !== 'visible') return;
      if (running) { queued = true; return; }
      clearTimeout(retryTimer);
      running = true;
      let accessDenied = false;
      const user = current, requestVersion = version;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 15000);
      setData(previous => previous?.day === day ? previous : null);
      try {
        const response = await fetch(`/api/teacher/attendance?day=${encodeURIComponent(day)}`, { cache: 'no-store', signal: requestController.signal, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const result = await response.json();
        if (stopped || requestVersion !== version) return;
        if (!response.ok) {
          if ([401, 403].includes(response.status)) { accessDenied=true;queued=false;stopEvents?.(); stopEvents=undefined; setData(null); setEditor(null); setState(response.status === 401 ? 'signed-out' : 'denied'); }
          throw new Error(result.error || '출석 현황을 불러오지 못했습니다.');
        }
        if(result.day!==day)throw new Error('조회 날짜가 일치하지 않습니다. 다시 불러와주세요.');
        retryDelay=1000;setData(result); setError(''); setState('ready');
      } catch (reason) {
        if (!stopped && requestVersion === version) {
          setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '연결이 지연되고 있습니다. 다시 연결하고 있습니다.');
          if(!accessDenied){retryTimer=setTimeout(()=>void load(),retryDelay);retryDelay=Math.min(retryDelay*2,30000);}
        }
      } finally {
        clearTimeout(timeout);
        if (!stopped && requestVersion === version) { running = false; if (queued) { queued=false; void load(); } }
      }
    }
    const resume = () => {
      if (document.visibilityState !== 'visible') { stopEvents?.(); stopEvents=undefined; return; }
      if (!current || stopped || stopEvents) return;
      const user=current, subscriptionVersion=version;
      if(day===today)stopEvents=watchTeacherAttendance({
        token:()=>user.getIdToken(),
        changed:()=>{if(!stopped&&subscriptionVersion===version)void load();},
        connected:()=>{},
        denied:status=>{
          if(stopped||subscriptionVersion!==version)return;
          version++;controller?.abort();clearTimeout(retryTimer);running=false;queued=false;setData(null);setEditor(null);setState(status===401?'signed-out':'denied');
        },
      });
      void load();
    };
    const off = onAuthStateChanged(auth, user => {
      version++; controller?.abort();clearTimeout(retryTimer);stopEvents?.();stopEvents=undefined;current=user;running=false;queued=false;
      setData(null);setError('');setEditor(null);setState(user?'loading':'signed-out');
      if(user)resume();
    });
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    const reconnect=()=>{stopEvents?.();stopEvents=undefined;resume();};
    window.addEventListener('online',reconnect);
    return () => { stopped=true;version++;controller?.abort();clearTimeout(retryTimer);stopEvents?.();off();document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('online',reconnect); };
  }, [refresh,day,today]);
  useEffect(()=>{
    const midnight=Date.parse(`${today}T00:00:00+09:00`)+86400000;
    const timer=setTimeout(()=>setToday(koreaDay()),Math.max(1,midnight-Date.now()));return()=>clearTimeout(timer);
  },[today]);

  const waitingLabels = {waiting:day>today?'수업 예정':'미출석',makeup_reserved:'보강 예정',absent:'결석',travel:'여행',sick:'병가',late_cancel:'당일 취소'};
  const arrivals = (data?.arrivals || []).filter(row => courseFilter === '전체' || row.course === courseFilter);
  const waiting = (data?.waiting || []).filter(row => courseFilter === '전체' || row.course === courseFilter);
  const rows = [...arrivals.map(arrival=>({studentId:arrival.studentId,name:arrival.name,course:arrival.course,arrival,waiting:undefined as TeacherWaiting|undefined})),...waiting.map(waiting=>({studentId:waiting.studentId,name:waiting.name,course:waiting.course,arrival:undefined as TeacherArrival|undefined,waiting}))].sort((a,b)=>compareTeacherAttendance(a,b,order));
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white px-5 py-5"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-bold tracking-widest text-blue-700">WHEE MUSIC</p><h1 className="mt-1 text-2xl font-bold">출석 현황 · 피아노·드럼</h1></div>
      <nav className="flex items-center gap-4 text-sm"><Link href="/admin" className="font-semibold text-blue-700">강사 업무</Link>{state !== 'signed-out' && <button onClick={() => void signOut(auth)}>로그아웃</button>}</nav>
    </div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-8">
      <p className="text-sm text-slate-600">등록된 수업 요일과 보강 예약 기준입니다. 미출석은 회색, 출석하면 등원 시간과 함께 검정색으로 자동 변경됩니다.</p>
      {state === 'signed-out' ? <section className="rounded-xl border bg-white p-6"><h2 className="text-lg font-bold">로그인이 필요합니다</h2><p className="mt-2 text-sm">승인된 피아노·드럼 강사 계정으로 로그인해주세요.</p><Link className="mt-4 inline-block rounded-lg bg-blue-700 px-5 py-2 text-white" href="/login">로그인</Link></section>
        : state === 'denied' ? <section role="alert" className="rounded-xl border bg-white p-6"><h2 className="font-bold">조회 권한이 없습니다</h2><p className="mt-2">승인된 피아노·드럼 강사와 관리자만 사용할 수 있습니다.</p><Link className="mt-4 inline-block text-blue-700" href="/admin">내 계정 상태 확인</Link></section>
        : <>
          <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold text-slate-500">출석 현황</h2><AttendanceDateNav day={day} today={today} disabled={!!editor} onChange={changeDay}/></div>
              <p className="mt-2 flex items-baseline gap-2" aria-live="polite"><span className="text-base font-semibold text-slate-700">출석</span><strong className="text-5xl font-extrabold tabular-nums tracking-tight text-blue-700">{data?arrivals.length:'—'}</strong><span className="text-xl font-bold text-slate-600">건</span></p><p className="mt-3 text-sm text-slate-500">{data?<>{day>today?'수업 예정':'미출석/사전 결석'} {waiting.length}건 · 전체 {rows.length}건</>:'선택한 날짜를 불러오는 중…'}</p>
            </div>
            <div className="flex gap-2">{state==='ready'&&viewingToday&&data&&<button disabled={!!editor} onClick={()=>{setMessage('');setEditor({});}} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">+ 출석</button>}</div>
          </section>
          <div role="group" aria-label="출석 과목 선택" className="flex flex-wrap gap-2">{['전체','어린이 피아노','드럼'].map(course=><button key={course} aria-pressed={courseFilter===course} onClick={()=>setCourseFilter(course)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${courseFilter===course?'border-blue-700 bg-blue-700 text-white':'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}>{course}</button>)}</div>
          {message&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{error} {data && '아래 목록은 마지막으로 확인된 기록입니다.'}</p>}
          {data && <section className="overflow-hidden rounded-xl border bg-white">
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{day} {courseFilter==='전체'?'피아노·드럼':courseFilter} 수업 예정 및 출석 현황 · {order==='name'?'이름순':order==='earliest'?'빠른 등원순':'늦은 등원순'}</caption><thead className="bg-slate-50 text-slate-600"><tr>
              <th className="whitespace-nowrap px-4 py-3" aria-sort={order==='name'?'ascending':'none'}><span className="inline-flex items-center gap-2">학생<button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" aria-label="학생 이름 가나다순 정렬" aria-pressed={order==='name'} onClick={()=>setOrder('name')}>ㄱㄴㄷ</button></span></th>
              <th className="whitespace-nowrap px-4 py-3">과목</th>
              <th className="whitespace-nowrap px-4 py-3" aria-sort={order==='earliest'?'ascending':order==='latest'?'descending':'none'}><span className="inline-flex items-center gap-2">등원 시간<button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" aria-label={order==='earliest'?'나중에 온 순으로 정렬':'빨리 온 순으로 정렬'} aria-pressed={order!=='name'} onClick={()=>setOrder(value=>value==='earliest'?'latest':'earliest')}>{order==='latest'?'↓':'↑'}</button></span></th>
              <th className="whitespace-nowrap px-4 py-3">상태</th></tr></thead><tbody>{rows.map(({studentId,name,course,arrival:row,waiting})=><tr key={studentId} className={`border-t ${row?'text-black':'text-[#737373]'}`} data-attendance={row?'arrived':'waiting'}>
              <td className="whitespace-nowrap px-4 py-4 font-semibold">{name}</td><td className="px-4 py-4">{course}</td>
              <td className="whitespace-nowrap px-4 py-4 tabular-nums">{row?viewingToday?<button aria-label={`${row.name} 등원 시간 수정`} onClick={()=>{setMessage('');setEditor({row});}} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-black shadow-sm hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"><Clock3 size={16} aria-hidden="true"/><span className="text-base font-bold">{clock(row.arrivalAt)}</span></button>:<span className="font-semibold">{clock(row.arrivalAt)}</span>:<span>—{waiting?.lessonTime&&<small className="mt-1 block">수업 {waiting.lessonTime}</small>}</span>}</td>
              <td className="whitespace-nowrap px-4 py-4">{row?<><span>{row.status==='makeup'?'보강 출석':'출석'}</span>{row.source==='teacher'&&<span className="ml-2 text-xs">강사 확인</span>}{row.source==='manual'&&<span className="ml-2 text-xs">수동 출석</span>}</>:waitingLabels[waiting!.status]}</td>
            </tr>)}</tbody></table></div>
            {!rows.length&&<p role="status" className="p-10 text-center text-sm text-slate-500">선택한 날짜의 수업 예정 학생과 출석 기록이 없습니다.</p>}
          </section>}
        </>}
    </div>
    {editor&&data&&viewingToday&&<TeacherArrivalDialog day={data.day} row={editor.row} close={()=>setEditor(null)} saved={message=>{setEditor(null);setMessage(message);setRefresh(value=>value+1);}}/>}
  </main>;
}
