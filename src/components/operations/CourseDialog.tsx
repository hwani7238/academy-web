'use client';
import {useEffect,useRef,useState} from 'react';
import {Snapshot} from '@/lib/operations/model';
import {REGISTRATION_SUBJECTS} from '@/lib/operations/registration';
import {groupName} from '@/lib/operations/student-order';
export function CourseDialog({student,save,close}:{student:Snapshot['students'][number];save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);const [mode,setMode]=useState('change'),[group,setGroup]=useState(REGISTRATION_SUBJECTS.includes(groupName(student))?groupName(student):''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance registration-dialog" aria-labelledby="course-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><h2 id="course-title">{student.name.split(' · ')[0]} · 과목 관리</h2><button disabled={busy} onClick={close}>닫기</button></div><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);try{await save({action:'manageCourse',studentId:student.id,sourceStudentId:student.sourceStudentId||student.id,subject:student.subject||student.instruments?.[0]||'',mode,group,expectedUpdatedAt:student.courseUpdatedAt||''});close();}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{lock.current=false;setBusy(false);}}}>
 <p>현재 과목·반: {groupName(student)}</p><label>변경 방법<select value={mode} onChange={e=>{setMode(e.target.value);setGroup('');}}><option value="change">현재 과목·반 변경</option><option value="add">다른 과목 추가</option></select></label>
 <label>과목·반<select value={group} onChange={e=>setGroup(e.target.value)} required><option value="" disabled>선택해주세요</option>{REGISTRATION_SUBJECTS.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
 <p className="subtle">{mode==='change'?'관리 페이지의 과목·반을 변경합니다. 기존 출결·청구 기록은 보존하고 잔여 횟수와 수강료는 그대로 유지합니다.':'기존 과목은 유지하며 별도 과목을 추가합니다. 추가 후 수강 등록에서 수강료와 잔여 횟수를 설정해주세요.'}</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'저장 중…':mode==='add'?'과목 추가':'과목 변경 저장'}</button></form></dialog>;
}
