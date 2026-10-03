'use client';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { type Account, type Snapshot, seoulDay } from '@/lib/operations/model';
import { GROUPS, compareGroups, compareStudents, displayEnrollmentName, groupName } from '@/lib/operations/student-order';
import { WEEKDAYS } from '@/lib/operations/schedule';
import { courseInitial } from '@/lib/operations/billing-display';
import { enrollmentState } from '@/lib/operations/lifecycle';
import { ACADEMY_DAYS, academyClosed } from '@/lib/operations/academy-calendar';
import { TIME_SLOTS, lessonSlot, offsetDay, timetableLessons, weekDays, type TimetableLesson } from '@/lib/operations/timetable';
import { CloseButton } from './CloseButton';

type Picked={account:Account;student:Snapshot['students'][number];from?:string};
export function Timetable({data,busy,edit,save}:{data:Snapshot;busy:boolean;edit:(account:Account)=>void;save:(input:Record<string,unknown>)=>Promise<unknown>}) {
  const [day,setDay]=useState(seoulDay),[subject,setSubject]=useState(''),[search,setSearch]=useState('');
  const [picked,setPicked]=useState<Picked|null>(null),[hover,setHover]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[onlyUnset,setOnlyUnset]=useState(false);
  const dragging=useRef<Picked|null>(null),lock=useRef(false),pointer=useRef<{x:number;y:number;value:Picked;moved:boolean}|null>(null),suppressClick=useRef(false);
  const actions=useRef<{place:(day:string,time:string)=>void;select:(value:Picked)=>void}>({place:()=>{},select:()=>{}});
  useEffect(()=>{
    const move=(e:globalThis.PointerEvent)=>{
      const p=pointer.current;if(!p)return;
      if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>5){p.moved=true;dragging.current=p.value;}
      if(!p.moved)return;
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-drop-day]');
      setHover(target?`${target.dataset.dropDay}_${target.dataset.dropTime}`:'');
      const scroller=document.querySelector<HTMLElement>('.timetable-scroll');
      if(scroller){const r=scroller.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right){if(e.clientY>Math.min(r.bottom,window.innerHeight)-30)scroller.scrollBy(0,20);else if(e.clientY<r.top+65&&e.clientY>=r.top)scroller.scrollBy(0,-20);}}
      if(e.clientY>window.innerHeight-25)window.scrollBy(0,16);else if(e.clientY<25)window.scrollBy(0,-16);
    };
    const up=(e:globalThis.PointerEvent)=>{
      const p=pointer.current;if(!p)return;pointer.current=null;suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},100);
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-drop-day]');
      if(p.moved&&target?.dataset.dropDay&&target.dataset.dropTime)actions.current.place(target.dataset.dropDay,target.dataset.dropTime);
      else if(!p.moved)actions.current.select(p.value);
      dragging.current=null;setHover('');
    };
    const cancel=()=>{pointer.current=null;dragging.current=null;setHover('');};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);};
  },[]);
  const days=useMemo(()=>weekDays(day),[day]),today=seoulDay();
  const {lessons,unset}=useMemo(()=>timetableLessons(data,days),[data,days]);
  const accounts=new Map(data.accounts.map(a=>[a.id,a])),unsetIds=new Set(unset.map(s=>s.student.id));
  const subjects=[...new Set([...GROUPS,...data.students.map(groupName)])].sort(compareGroups);
  const matches=(s:Snapshot['students'][number])=>(!subject||groupName(s)===subject)&&s.name.includes(search.trim());
  const visible=lessons.filter(l=>matches(l.student));
  const pool=data.students.filter(s=>matches(s)&&accounts.get(s.id)?.active!==false&&days.some(d=>enrollmentState(s.lifecycle,d)==='active')&&(!onlyUnset||unsetIds.has(s.id))).sort(compareStudents);
  const disabled=busy||saving;
  const initials=(s:Snapshot['students'][number])=>courseInitial(groupName(s)).replace('PF','Pf');
  function select(value:Picked){setPicked(value);setError('');}
  function beginPointer(e:PointerEvent,value:Picked){if(disabled||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointer.current={x:e.clientX,y:e.clientY,value,moved:false};select(value);}
  async function place(to:string,time:string){
    const source=dragging.current||picked;
    if(!source||lock.current||busy)return;
    dragging.current=null;setHover('');setError('');setNotice('');
    if(to<today){setError('오늘 이후 날짜에 배치해주세요. 다음 주로 넘겨서 설정할 수 있어요.');return;}
    if(academyClosed(to)){setError('학원 휴원일에는 배치할 수 없습니다.');return;}
    lock.current=true;setSaving(true);
    try{
      await save({action:'placeTimetableLesson',studentId:source.account.id,from:source.from,to,time,expectedUpdatedAt:source.account.schedule?.updatedAt||''});
      setPicked(null);setNotice(`${source.student.name.split(' · ')[0]} · ${WEEKDAYS[new Date(`${to}T00:00:00Z`).getUTCDay()]} ${time} 저장했습니다.`);
    }catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{lock.current=false;setSaving(false);}
  }
  useEffect(()=>{actions.current={place,select};});
  const card=(lesson:TimetableLesson)=><button type="button" className={`timetable-lesson${picked?.account.id===lesson.account.id&&picked.from===lesson.day?' selected':''}`} key={`${lesson.student.id}_${lesson.day}`} draggable={false} disabled={disabled} title={`${displayEnrollmentName(lesson.student)} · ${lesson.time?.start||'시간 미설정'}${lesson.time?.end?'–'+lesson.time.end:''}${lesson.moved?' · 개별 이동 수업':''} · 드래그로 이동 / 클릭해 선택`} aria-label={`${displayEnrollmentName(lesson.student)} ${lesson.day} ${lesson.time?.start||'시간 미설정'} 수업 선택`} onPointerDown={e=>beginPointer(e,{account:lesson.account,student:lesson.student,from:lesson.day})} onClick={()=>{if(!suppressClick.current)select({account:lesson.account,student:lesson.student,from:lesson.day});}}>{lesson.time&&Number(lesson.time.start.slice(3))%30!==0&&<time>{lesson.time.start}</time>}<strong>{lesson.student.name.split(' · ')[0]}</strong><span>{initials(lesson.student)}</span></button>;
  return <div className="timetable"><div className="section-head"><div><h2>총 시간표</h2><p>학생 카드를 아래 시간 칸으로 드래그하세요. 카드를 선택한 뒤 시간 칸을 눌러도 배치할 수 있어요.</p><p>10분 단위 · 정규 수업은 이후 매주 반영 · 개별 이동 수업은 해당 수업만 변경</p></div><div className="header-actions"><label>과목<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label><label>학생 찾기<input value={search} placeholder="이름" onChange={e=>setSearch(e.target.value)}/></label></div></div>
    <div className="timetable-toolbar"><button type="button" aria-label="이전 주" disabled={disabled} onClick={()=>setDay(offsetDay(day,-7))}>‹</button><h3>{days[0].replaceAll('-','.')} – {days[6].slice(5).replace('-','.')}</h3><button type="button" aria-label="다음 주" disabled={disabled} onClick={()=>setDay(offsetDay(day,7))}>›</button><button type="button" onClick={()=>setDay(seoulDay())}>이번 주</button><label>조회 주<input type="date" value={day} onInput={e=>{if(e.currentTarget.value)setDay(e.currentTarget.value);}}/></label></div>
    <details className="timetable-pending" open><summary>학생 카드 <b>{pool.length}</b></summary><label className="timetable-unset-toggle"><input type="checkbox" checked={onlyUnset} onChange={e=>setOnlyUnset(e.target.checked)}/>요일·시간 미설정만</label><div className="timetable-student-list">{pool.map(student=>{const account=accounts.get(student.id);return <button type="button" key={student.id} className={picked?.account.id===student.id&&!picked.from?'selected':''} title={account?`${displayEnrollmentName(student)} · 드래그로 배치 / 클릭해 선택`:'총 등록 현황에서 수강 등록이 필요합니다.'} aria-label={`${displayEnrollmentName(student)} 배치할 학생 선택`} draggable={false} disabled={disabled||!account} onPointerDown={e=>account&&beginPointer(e,{student,account})} onClick={()=>{if(account&&!suppressClick.current)select({student,account});}}><strong>{student.name.split(' · ')[0]}</strong><span>{initials(student)}</span></button>;})}</div>{!pool.length&&<p>선택한 조건에 해당하는 학생이 없습니다.</p>}</details>
    <div className="timetable-selection" role="status">{picked?<><strong>{picked.student.name.split(' · ')[0]} {initials(picked.student)}</strong><span>{saving?'저장 중…':'배치할 요일·시간을 선택하세요.'}</span><button disabled={disabled} onClick={()=>{edit(picked.account);setPicked(null);}}>요일·시간 수정</button><CloseButton disabled={disabled} onClick={()=>{setPicked(null);setHover('');}}/></>:<span>카드를 끌거나 선택해서 배치하세요. 카드를 선택하면 요일·시간도 수정할 수 있어요.</span>}</div>
    <p className={`timetable-feedback${error?' has-error':''}`} role={error?'alert':'status'}>{error||notice||'\u00a0'}</p>
    <div className={`timetable-scroll${picked?' placing':''}`}><table className="timetable-table"><caption className="sr-only">월요일부터 일요일까지 오전 10시부터 오후 10시까지 수업 시간표</caption><thead><tr><th scope="col">시간</th>{days.map(d=><th scope="col" key={d} className={`${d===today?'is-today ':''}${new Date(`${d}T00:00:00Z`).getUTCDay()===0?'sunday':new Date(`${d}T00:00:00Z`).getUTCDay()===6?'saturday':''}`}><span>{d.slice(5).replace('-','/')} ({WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]})</span>{ACADEMY_DAYS[d]&&<small>{ACADEMY_DAYS[d].label}</small>}</th>)}</tr></thead><tbody>
    {TIME_SLOTS.map((time,n)=><tr key={time} className={n%2?'half-hour':''}><th scope="row">{time}</th>{days.map(d=><td key={d} className={`${academyClosed(d)?'closed ':''}${d===today?'is-today':''}`}>{[0,10,20].map(delta=>{const minute=Number(time.slice(3))+delta,slotTime=`${time.slice(0,2)}:${String(minute).padStart(2,'0')}`,key=`${d}_${slotTime}`,blocked=d<today||academyClosed(d);return <div key={key} data-drop-day={d} data-drop-time={slotTime} className={`timetable-drop${hover===key?' drop-hover':''}${blocked?' drop-blocked':''}`} onDragOver={e=>{if(dragging.current&&!blocked&&!disabled){e.preventDefault();e.dataTransfer.dropEffect='move';setHover(key);}}} onDragLeave={()=>setHover(v=>v===key?'':v)} onDrop={e=>{e.preventDefault();void place(d,slotTime);}}><button type="button" className="timetable-drop-button" aria-label={`${d} ${slotTime}에 수업 배치`} disabled={disabled||!picked||blocked} onClick={()=>void place(d,slotTime)}><span>{slotTime}</span></button><div className="timetable-drop-cards">{visible.filter(l=>l.day===d&&l.time&&lessonSlot(l.time)===n&&Math.floor(Number(l.time.start.slice(3))%30/10)*10===delta).map(card)}</div></div>;})}</td>)}</tr>)}<tr className="timetable-end"><th scope="row">22:00</th>{days.map(d=><td key={d}/>)}</tr>
    </tbody></table></div>
  </div>;
}
