'use client';
import {useEffect,useRef,useState} from 'react';
import type {Account} from '@/lib/operations/model';
import {seoulDay} from '@/lib/operations/model';
import {WEEKDAYS,WEEK_ORDER,ruleOn,scheduleLabel,plannedLesson} from '@/lib/operations/schedule';
import {CloseButton} from './CloseButton';
type Props={account:Account;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void};
export function ScheduleDialog({account,save,close}:Props){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),revision=useRef(account.schedule?.updatedAt||''),today=seoulDay();
 const initialStart=ruleOn(account.schedule,today)?today:account.schedule?.rules.find(r=>r.start>=today)?.start||today;
 const [start,setStart]=useState(initialStart),[weekdays,setWeekdays]=useState(ruleOn(account.schedule,initialStart)?.weekdays||[]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 async function commit(remove=false,date=start){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await save({action:'saveSchedule',studentId:account.id,start:date,weekdays,remove,expectedUpdatedAt:revision.current});close();}
  catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}
 }
 return <dialog ref={ref} className="quick-attendance schedule-dialog" aria-labelledby="schedule-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}>
  <div className="section-head"><div><h2 id="schedule-title">정규 수업 요일</h2><p>{account.name}</p></div><CloseButton disabled={busy} onClick={close}/></div>
  <form onSubmit={e=>{e.preventDefault();void commit();}}>
   <label>적용 시작일<input type="date" min={today} value={start} onInput={e=>setStart(e.currentTarget.value)} required/></label>
   <div className="weekday-options" role="group" aria-label="정규 수업 요일 선택">{WEEK_ORDER.map(n=><button type="button" key={n} aria-label={`${WEEKDAYS[n]}요일`} aria-pressed={weekdays.includes(n)} disabled={busy} onClick={()=>setWeekdays(v=>v.includes(n)?v.filter(d=>d!==n):[...v,n])}>{WEEKDAYS[n]}</button>)}</div>
   <p className="schedule-summary"><strong>{weekdays.length?`주 ${weekdays.length}회`:'정규 수업 없음'}</strong>{weekdays.length>0 && ` · 4주 기준 ${weekdays.length*4}회`}</p>
   <p className="subtle">적용일 전의 요일은 유지합니다. 이후에 예약한 다른 요일 변경이 있으면 그 전날까지 적용됩니다. 학원 휴원일은 예정 수업에서 제외됩니다. 그 외 공휴일은 운영 여부를 확인해주세요.</p>
   <p className="notice">이 설정은 오는 날만 바꿉니다. 현재 수강권·잔여 횟수·수강료는 그대로이며, 다음 수강권 조건은 ‘설정 수정’에서 별도로 변경해주세요. 개별 이동한 수업은 유지됩니다.</p>
   <button className="primary" disabled={busy||!start}>{busy?'저장 중…':'수업 요일 저장'}</button>
  </form>
  {!!account.schedule?.rules.length && <section className="schedule-history"><h3>요일 변경 내역</h3>{account.schedule.rules.map(r=><div key={r.start}><button type="button" className="text-button" disabled={busy||r.start<today} onClick={()=>{setStart(r.start);setWeekdays(r.weekdays);}}>{r.start}부터 · {scheduleLabel(account.schedule,r.start)}</button>{r.start>=today && <button type="button" className="danger-text" disabled={busy} onClick={()=>void commit(true,r.start)}>변경 취소</button>}</div>)}</section>}
  {error && <p className="error" role="alert">{error}</p>}
 </dialog>;
}
export function MoveLessonDialog({account,from,save,close}:Props & {from:string}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),revision=useRef(account.schedule?.updatedAt||'');
 const [to,setTo]=useState(from),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const origin=plannedLesson(account.schedule,from)?.origin;
 useEffect(()=>{ref.current?.showModal();},[]);
 async function commit(target=to){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await save({action:'moveLesson',studentId:account.id,from,to:target,expectedUpdatedAt:revision.current});close();}catch(e){setError(e instanceof Error?e.message:'이동하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
 return <dialog ref={ref} className="quick-attendance" aria-labelledby="move-lesson-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><div><h2 id="move-lesson-title">이번 수업일 이동</h2><p>{account.name} · {from}</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <form onSubmit={e=>{e.preventDefault();void commit();}}><label>옮길 날짜<input type="date" min={seoulDay()} value={to} onInput={e=>setTo(e.currentTarget.value)} required/></label><p className="subtle">이 수업만 옮깁니다. 정규 요일·출결 기록·잔여 횟수는 바뀌지 않습니다.</p><button className="primary" disabled={busy||!to||to===from}>수업일 이동</button>{origin && origin!==from && <button type="button" disabled={busy} onClick={()=>void commit(origin)}>원래 날짜 {origin}로 되돌리기</button>}</form>{error && <p className="error" role="alert">{error}</p>}</dialog>;
}
