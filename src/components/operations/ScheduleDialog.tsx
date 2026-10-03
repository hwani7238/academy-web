'use client';
import {useEffect,useRef,useState} from 'react';
import type {Account} from '@/lib/operations/model';
import {seoulDay} from '@/lib/operations/model';
import {WEEKDAYS,WEEK_ORDER,ruleOn,scheduleLabel,plannedLesson,type LessonTime} from '@/lib/operations/schedule';
import {CloseButton} from './CloseButton';
type Props={account:Account;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void};
export function ScheduleDialog({account,save,close}:Props){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),revision=useRef(account.schedule?.updatedAt||''),today=seoulDay();
 const initialStart=ruleOn(account.schedule,today)?today:account.schedule?.rules.find(r=>r.start>=today)?.start||today;
 const [start,setStart]=useState(initialStart),[weekdays,setWeekdays]=useState(ruleOn(account.schedule,initialStart)?.weekdays||[]),[times,setTimes]=useState<Record<string,LessonTime>>(ruleOn(account.schedule,initialStart)?.times||{}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 async function commit(remove=false,date=start){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await save({action:'saveSchedule',studentId:account.id,start:date,weekdays,times,remove,expectedUpdatedAt:revision.current});close();}
  catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}
 }
 return <dialog ref={ref} className="quick-attendance schedule-dialog" aria-labelledby="schedule-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}>
  <div className="section-head"><div><h2 id="schedule-title">정규 수업 요일·시간</h2><p>{account.name}</p></div><CloseButton disabled={busy} onClick={close}/></div>
  <form onSubmit={e=>{e.preventDefault();void commit();}}>
   <label>적용 시작일<input type="date" min={today} value={start} onInput={e=>setStart(e.currentTarget.value)} required/></label>
   <div className="weekday-options" role="group" aria-label="정규 수업 요일 선택">{WEEK_ORDER.map(n=><button type="button" key={n} aria-label={`${WEEKDAYS[n]}요일`} aria-pressed={weekdays.includes(n)} disabled={busy} onClick={()=>setWeekdays(v=>v.includes(n)?v.filter(d=>d!==n):[...v,n])}>{WEEKDAYS[n]}</button>)}</div>
   {weekdays.length>0 && <div className="schedule-times"><p className="subtle">요일별 수업 시간 · 24시간 형식 (예: 14:30). 시작 시간을 비워두면 시간 미설정으로 표시됩니다.</p>{WEEK_ORDER.filter(n=>weekdays.includes(n)).map(n=><div className="schedule-time-row" key={n}><strong>{WEEKDAYS[n]}</strong><label>시작<input aria-label={`${WEEKDAYS[n]}요일 시작 시간`} placeholder="14:00" inputMode="text" pattern="[0-2][0-9]:[0-5][0-9]" maxLength={5} disabled={busy} value={times[n]?.start||''} onInput={e=>{const value=e.currentTarget.value;setTimes(v=>({...v,[n]:{start:value,end:v[n]?.end||''}}));}}/></label><span>~</span><label>종료 (선택)<input aria-label={`${WEEKDAYS[n]}요일 종료 시간`} placeholder="15:00" inputMode="text" pattern="[0-2][0-9]:[0-5][0-9]" maxLength={5} disabled={busy} value={times[n]?.end||''} onInput={e=>{const value=e.currentTarget.value;setTimes(v=>({...v,[n]:{start:v[n]?.start||'',end:value}}));}}/></label></div>)}</div>}
   <p className="schedule-summary"><strong>{weekdays.length?`주 ${weekdays.length}회`:'정규 수업 없음'}</strong>{weekdays.length>0 && ` · 4주 기준 ${weekdays.length*4}회`}</p>
   <p className="subtle">적용일 전의 요일은 유지합니다. 이후에 예약한 다른 요일 변경이 있으면 그 전날까지 적용됩니다. 학원 휴원일은 예정 수업에서 제외됩니다. 그 외 공휴일은 운영 여부를 확인해주세요.</p>
   <p className="notice">이 설정은 수업 요일·시간을 바꿉니다. 현재 수강권·잔여 횟수·수강료는 그대로이며, 다음 수강권 조건은 ‘설정 수정’에서 별도로 변경해주세요. 개별 이동한 수업은 유지됩니다.</p>
   <button className="primary" disabled={busy||!start}>{busy?'저장 중…':'저장'}</button>
  </form>
  {!!account.schedule?.rules.length && <section className="schedule-history"><h3>요일·시간 변경 내역</h3>{account.schedule.rules.map(r=><div key={r.start}><button type="button" className="text-button" disabled={busy||r.start<today} onClick={()=>{setStart(r.start);setWeekdays(r.weekdays);setTimes(r.times||{});}}>{r.start}부터 · {scheduleLabel(account.schedule,r.start)}{r.times && <small>{WEEK_ORDER.filter(n=>r.times?.[n]).map(n=>`${WEEKDAYS[n]} ${r.times![n].start}${r.times![n].end?'–'+r.times![n].end:''}`).join(' · ')}</small>}</button>{r.start>=today && <button type="button" className="danger-text" disabled={busy} onClick={()=>void commit(true,r.start)}>변경 취소</button>}</div>)}</section>}
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
