'use client';
import { CloseButton } from './CloseButton';
import {useEffect,useRef,useState} from 'react';
import {displayEnrollmentName} from '@/lib/operations/student-order';
import {seoulDay, type Snapshot} from '@/lib/operations/model';
export function LifecycleDialog({student,status,save,close}:{student:Snapshot['students'][number];status:'paused'|'withdrawn';save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const editing=status==='paused'&&student.lifecycle?.status==='paused';
 const ref=useRef<HTMLDialogElement>(null);const lock=useRef(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance registration-dialog" onCancel={e=>{e.preventDefault();if(!lock.current)close();}} aria-labelledby="lifecycle-title"><div className="section-head"><h2 id="lifecycle-title">{displayEnrollmentName(student)} · {editing?'휴원 종료일 수정':status==='paused'?'휴원 처리':'퇴원 처리'}</h2><CloseButton disabled={busy} onClick={close} /></div><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);const f=Object.fromEntries(new FormData(e.currentTarget));try{await save({...f,action:'changeLifecycle',studentId:student.id,sourceStudentId:student.sourceStudentId||student.id,status,expectedUpdatedAt:student.lifecycle?.updatedAt||''});close();}catch(e){setError(e instanceof Error?e.message:'처리 실패');}finally{lock.current=false;setBusy(false);}}}>
 <p className="subtle">선택한 과목에만 적용됩니다. 다른 과목은 계속 수강할 수 있습니다. 출결·잔여 횟수·수납 기록은 그대로 보관합니다.</p>
 {status==='paused'&&<label>휴원 종료일<input name="until" type="date" min={seoulDay()} defaultValue={editing?student.lifecycle?.until:undefined} required/><small>선택한 날짜까지 휴원하고 다음 날 자동 복귀합니다.</small></label>}
 {status==='withdrawn'&&<label>퇴원일<input name="withdrawnOn" type="date" max={seoulDay()} defaultValue={seoulDay()} required/><small>실제 퇴원한 날짜를 입력하세요. 저장하면 퇴원 목록으로 이동합니다.</small></label>}
 <label>사유·비고 (선택)<textarea name="note" maxLength={500} defaultValue={editing?student.lifecycle?.note:undefined}/></label>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'저장 중…':editing?'휴원 종료일 저장':status==='paused'?'휴원 처리':'퇴원 처리'}</button>
 </form></dialog>;
}
