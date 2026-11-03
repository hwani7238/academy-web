'use client';
import {useMemo,useRef,useState} from 'react';
import type {Snapshot} from '@/lib/operations/model';
import {displayEnrollmentName} from '@/lib/operations/student-order';

export function ReferenceCellsEditor({data,month,save,onBusy}:{data:Snapshot;month:string;save:(v:Record<string,unknown>)=>Promise<unknown>;onBusy:(busy:boolean)=>void}){
 const [studentId,setStudentId]=useState(''),[start,setStart]=useState(month+'-01'),[end,setEnd]=useState(month+'-01');
 const [values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),revision=useRef<string|null>(null);
 const references=data.sequenceContext?.references||[];
 const dates=useMemo(()=>{
  if(!start.startsWith(month+'-')||!end.startsWith(month+'-')||end<start)return [];
  return Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(d=>d>=start&&d<=end&&Number(d.slice(-2))<=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate());
 },[start,end,month]);
 function reset(){setValues({});setMessage('');setError('');revision.current=null;}
 function value(day:string){return values[day]??references.find(r=>r.studentId===studentId&&r.day===day)?.value??'';}
 return <details><summary>학생별 날짜·회차 수정</summary>
  <p>잘못 옮겨진 장부 회차만 수정합니다. 빈칸으로 저장하면 해당 날짜의 장부 표시를 지웁니다. 실제 출결·차감·수납은 유지합니다.</p>
  <form onSubmit={async e=>{
   e.preventDefault();if(lock.current||!studentId||!dates.length)return;
   lock.current=true;setBusy(true);onBusy(true);setError('');setMessage('');
   try{
    await save({action:'correctLessonReferences',month,studentId,cells:dates.map(day=>({day,value:value(day)})),expectedRevision:revision.current??data.sequenceContext?.referenceRevision??''});
    reset();setMessage('선택한 날짜의 장부 회차를 수정했습니다.');
   }catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}
   finally{lock.current=false;setBusy(false);onBusy(false);}
  }}>
   <label>회차 수정 학생<select value={studentId} required disabled={busy} onChange={e=>{setStudentId(e.target.value);reset();}}>
    <option value="">학생·과목 선택</option>{data.students.filter(s=>data.accounts.some(a=>a.id===s.id)).sort((a,b)=>displayEnrollmentName(a).localeCompare(displayEnrollmentName(b),'ko')).map(s=><option key={s.id} value={s.id}>{displayEnrollmentName(s)}</option>)}
   </select></label>
   <label>수정 시작일<input type="date" value={start} min={month+'-01'} disabled={busy} onInput={e=>{setStart(e.currentTarget.value);reset();}}/></label>
   <label>수정 종료일<input type="date" value={end} min={start} disabled={busy} onInput={e=>{setEnd(e.currentTarget.value);reset();}}/></label>
   {studentId&&dates.map(day=><label key={day}>{day} 장부 회차<input aria-label={day+' 장부 회차'} value={value(day)} disabled={busy} placeholder="빈칸: 장부 표시 지움" onChange={e=>{revision.current??=data.sequenceContext?.referenceRevision||'';setValues(v=>({...v,[day]:e.target.value}));setMessage('');}}/></label>)}
   <button className="primary" disabled={busy||!studentId||!dates.length}>{busy?'저장 중…':'선택 날짜 회차 저장'}</button>
   {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
  </form>
 </details>;
}
