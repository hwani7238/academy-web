'use client';
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { koreaDay, type PianoArrival, type PianoRoster, type PianoStudent } from '@/lib/teacher-attendance';
const currentClock = () => new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
export function TeacherArrivalDialog({day,row,close,saved}:{day:string;row?:PianoArrival;close:()=>void;saved:(message:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [students,setStudents]=useState<PianoStudent[]>([]),[studentId,setStudentId]=useState(''),[search,setSearch]=useState('');
  const [time,setTime]=useState(()=>row?.arrivalAt ? new Date(row.arrivalAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}) : currentClock());
  const [loading,setLoading]=useState(!row),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    if(row)return;
    const controller=new AbortController();let stopped=false;
    const timer=setTimeout(()=>controller.abort(),15000);
    setLoading(true);setError('');
    void (async()=>{
      try{
        if(!auth.currentUser)throw Error('다시 로그인해주세요.');
        const response=await fetch('/api/teacher/attendance?roster=1',{cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});
        const result=await response.json();if(!response.ok)throw Error(result.error||'학생 목록을 불러오지 못했습니다.');
        if((result as PianoRoster).day!==day)throw Error('날짜가 변경됐습니다. 창을 닫고 새로고침해주세요.');
        if(!stopped)setStudents(result.students);
      }catch(reason){if(!stopped)setError(reason instanceof Error&&reason.name!=='AbortError'?reason.message:'연결이 지연됩니다. 다시 불러와주세요.');}
      finally{clearTimeout(timer);if(!stopped)setLoading(false);}
    })();return()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[row,day,retry]);
  async function submit(){
    if(saving)return;setError('');
    if(day!==koreaDay()){setError('날짜가 변경됐습니다. 창을 닫고 새로고침해주세요.');return;}
    if(!row&&!studentId){setError('출석할 학생을 선택해주세요.');return;}
    setSaving(true);
    try{
      if(!auth.currentUser)throw Error('다시 로그인해주세요.');
      const payload=row?{action:'correctTime',day,attendanceId:row.id,time,expectedUpdatedAt:row.updatedAt}:{action:'checkIn',day,studentId,time};
      const response=await fetch('/api/teacher/attendance',{method:'POST',headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'저장하지 못했습니다.');
      saved(result.duplicate?'이미 출석한 학생입니다. 필요하면 목록에서 등원 시간을 수정해주세요.':row?'등원 시간을 수정했습니다.':'알림 없이 출석을 등록했습니다.');
    }catch(reason){setError(reason instanceof Error&&reason.name!=='TimeoutError'?reason.message:'응답이 지연됩니다. 창을 닫고 새로고침하여 저장 여부를 확인해주세요.');}
    finally{setSaving(false);}
  }
  const [hour,minute]=time.split(':');
  const results=students.filter(s=>s.name.includes(search.trim()));
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!saving)close();}} aria-labelledby="teacher-arrival-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/30">
    <div className="flex items-start justify-between gap-3"><div><h2 id="teacher-arrival-title" className="text-lg font-bold">{row?'등원 시간 수정':'출석 등록'}</h2><p className="mt-1 text-sm text-slate-500">{day}{row?` · ${row.name} · ${row.course}`:''}</p></div><button type="button" aria-label="닫기" disabled={saving} onClick={close} className="px-2 text-2xl text-slate-500 disabled:opacity-40">×</button></div>
    <form onSubmit={event=>{event.preventDefault();void submit();}} className="mt-5 space-y-4">
      {!row&&<div><label className="block text-sm font-semibold">학생 찾기<input autoFocus value={search} disabled={saving} onChange={e=>setSearch(e.target.value)} placeholder="이름을 입력하세요" className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal"/></label>
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200">{loading?<p className="p-4 text-sm text-slate-500">학생 목록을 불러오는 중…</p>:results.map(s=><button type="button" key={s.id} disabled={s.attended||saving} aria-pressed={studentId===s.id} onClick={()=>setStudentId(s.id)} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 disabled:opacity-40 ${studentId===s.id?'bg-blue-50 text-blue-800':'hover:bg-slate-50'}`}><span><strong>{s.name}</strong><span className="ml-2 text-xs">{s.course}</span></span><span>{s.attended?'출석 완료':studentId===s.id?'선택':''}</span></button>)}{!loading&&!results.length&&<p className="p-4 text-sm text-slate-500">해당 학생이 없습니다.</p>}</div>
        {!loading&&error&&<button type="button" disabled={saving} onClick={()=>setRetry(v=>v+1)} className="mt-2 text-sm text-blue-700">목록 다시 불러오기</button>}
      </div>}
      <fieldset disabled={saving}><legend className="text-sm font-semibold">실제 등원 시간 · 24시간</legend><div className="mt-2 flex items-center gap-2"><select aria-label="등원 시" value={hour} onChange={e=>setTime(`${e.target.value}:${minute}`)} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-3">{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v}>{v}</option>)}</select><span>:</span><select aria-label="등원 분" value={minute} onChange={e=>setTime(`${hour}:${e.target.value}`)} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-3">{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v}>{v}</option>)}</select></div></fieldset>
      <p className="text-sm leading-relaxed text-slate-500">{row?'시간만 수정하며 수강 횟수는 바뀌지 않습니다. 알림을 다시 보내지 않으며, 이미 발송된 알림은 그대로 남습니다.':'알림톡 없이 실제 등원을 등록합니다. 월별 출석표와 수강 횟수에도 반영되며, 이후 출석번호를 눌러도 중복 차감하거나 알림을 보내지 않습니다.'}</p>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={saving||loading||(!row&&!studentId)} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-40">{saving?'저장 중…':row?'시간 저장':'알림 없이 출석 저장'}</button>
    </form>
  </dialog>;
}
