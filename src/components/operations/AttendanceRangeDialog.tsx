'use client';
import { useEffect, useRef, useState } from 'react';
import { attendanceDays, RANGE_STATUSES } from '@/lib/operations/attendance-range';
import { ATTENDANCE_LABELS, type Attendance, type Snapshot } from '@/lib/operations/model';
import { displayEnrollmentName } from '@/lib/operations/student-order';
import { CloseButton } from './CloseButton';

export type RangeSelection = { studentId:string; start:string; end:string; existing?:Attendance['range']; status?:Attendance['status'] };
export function AttendanceRangeDialog({ selection, data, busy, save, close }: {
  selection:RangeSelection; data:Snapshot; busy:boolean; save:(v:Record<string,unknown>)=>Promise<unknown>; close:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null), lock=useRef(false), request=useRef(crypto.randomUUID());
  const [start,setStart]=useState(selection.start),[end,setEnd]=useState(selection.end);
  const [status,setStatus]=useState<typeof RANGE_STATUSES[number]>(RANGE_STATUSES.includes(selection.status as typeof RANGE_STATUSES[number])?selection.status as typeof RANGE_STATUSES[number]:'travel');
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const student=data.students.find(s=>s.id===selection.studentId)!;
  let days:string[]=[];try{days=attendanceDays(start,end);}catch{}
  const rows=data.attendance.filter(r=>r.studentId===selection.studentId && days.includes(r.day));
  const conflicts=rows.filter(r=>r.units>0 || ['present','makeup'].includes(r.status||'present'));
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function commit(cancel:boolean,note='') {
    if(busy||lock.current)return;
    lock.current=true;setSaving(true);setError('');
    try {
      await save({action:'recordAttendanceRange',studentId:selection.studentId,start,end,status:cancel?'cancelled':status,note,rangeId:selection.existing?.id||request.current,revisions:Object.fromEntries(rows.map(r=>[r.day,r.updatedAt]))});
      close();
    } catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}
    finally{lock.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} className="quick-attendance range-dialog" aria-labelledby="range-title" onCancel={e=>{e.preventDefault();if(!lock.current&&!busy)close();}}>
    <div className="section-head"><div><h2 id="range-title">{selection.existing?'등록한 기간':'기간 표시'}</h2><p>{displayEnrollmentName(student)}</p></div><CloseButton disabled={busy||saving} onClick={close}/></div>
    <form onSubmit={e=>{e.preventDefault();void commit(false,String(new FormData(e.currentTarget).get('note')||''));}}>
      <div className="range-dates"><label>시작일<input type="date" value={start} onInput={e=>setStart(e.currentTarget.value)} readOnly={!!selection.existing} required/></label><span aria-hidden="true">—</span><label>종료일<input type="date" value={end} min={start} onInput={e=>setEnd(e.currentTarget.value)} readOnly={!!selection.existing} required/></label></div>
      <p className="subtle">{days.length?`${days.length}일 · 시작일과 종료일을 포함합니다.`:'시작일과 종료일을 확인해주세요.'}</p>
      {!selection.existing && <><div className="range-statuses" role="group" aria-label="기간 상태">{RANGE_STATUSES.map(v=><button type="button" key={v} aria-pressed={status===v} onClick={()=>setStatus(v)}>{ATTENDANCE_LABELS[v]}</button>)}</div><label>비고 (선택)<input name="note" maxLength={500} placeholder="예: 가족 여행"/></label><p className="subtle">수업 횟수는 차감하지 않습니다. 출석·차감 기록이 있는 날은 개별 수정해주세요.</p>{conflicts.length>0 && <p className="error">선택 기간에 출석·차감 기록 {conflicts.length}건이 있습니다. 기간을 조정해주세요.</p>}<button className="primary" disabled={busy||saving||!days.length||conflicts.length>0}>{saving?'저장 중…':`${days.length}일 ${ATTENDANCE_LABELS[status]}${status==='sick'?'로':'으로'} 표시`}</button></>}
      {selection.existing && <><p className="subtle">{ATTENDANCE_LABELS[status]}{status==='sick'?'로':'으로'} 등록한 기간입니다. 전체 취소 시 빈칸으로 돌아갑니다. 따로 변경한 날짜는 유지합니다.</p><button type="button" className="danger-text" disabled={busy||saving} onClick={()=>void commit(true)}>{saving?'취소 중…':'기간 전체 취소'}</button></>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </dialog>;
}
