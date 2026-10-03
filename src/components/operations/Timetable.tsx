'use client';
import { useMemo, useState } from 'react';
import { type Account, type Snapshot, seoulDay } from '@/lib/operations/model';
import { GROUPS, compareGroups, displayEnrollmentName, groupName } from '@/lib/operations/student-order';
import { WEEKDAYS, scheduleLabel } from '@/lib/operations/schedule';
import { ACADEMY_DAYS, academyClosed } from '@/lib/operations/academy-calendar';
import { TIME_SLOTS, lessonSlot, offsetDay, timetableLessons, weekDays, type TimetableLesson } from '@/lib/operations/timetable';

export function Timetable({data,busy,edit}:{data:Snapshot;busy:boolean;edit:(account:Account)=>void}) {
  const [day,setDay]=useState(seoulDay),[subject,setSubject]=useState(''),[search,setSearch]=useState('');
  const days=useMemo(()=>weekDays(day),[day]);
  const {lessons,unset}=useMemo(()=>timetableLessons(data,days),[data,days]);
  const subjects=[...new Set([...GROUPS,...data.students.map(groupName)])].sort(compareGroups);
  const matches=(s:Snapshot['students'][number])=>(!subject||groupName(s)===subject)&&s.name.includes(search.trim());
  const visible=lessons.filter(l=>matches(l.student)),pending=unset.filter(s=>matches(s.student));
  const card=(lesson:TimetableLesson)=><button type="button" className={`timetable-lesson${lesson.moved?' moved':''}`} key={`${lesson.student.id}_${lesson.day}`} disabled={busy} title="정규 수업 요일·시간 수정" aria-label={`${displayEnrollmentName(lesson.student)} ${lesson.day} ${lesson.time?`${lesson.time.start}~${lesson.time.end}`:'시간 미설정'} 수업 설정`} onClick={()=>edit(lesson.account)}><strong>{lesson.student.name.split(' · ')[0]}</strong><span>{groupName(lesson.student)}</span>{lesson.time&&<time>{lesson.time.start}–{lesson.time.end}</time>}{lesson.moved&&<small>이동한 수업</small>}</button>;
  return <div className="timetable"><div className="section-head"><div><h2>총 시간표</h2><p>10:00–22:00 · 정규 수업과 개별 이동 일정 · 수업을 누르면 요일·시간을 수정할 수 있어요.</p><p>수업은 시작 시간 칸에 표시됩니다. 출결·보강 예약은 월별 출석표에서 확인하세요.</p></div><div className="header-actions"><label>과목<select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">전체 과목</option>{subjects.map(s=><option key={s}>{s}</option>)}</select></label><label>학생 찾기<input value={search} placeholder="이름" onChange={e=>setSearch(e.target.value)}/></label></div></div>
    <div className="timetable-toolbar"><button type="button" aria-label="이전 주" onClick={()=>setDay(offsetDay(day,-7))}>‹</button><h3>{days[0].replaceAll('-','.')} – {days[6].slice(5).replace('-','.')}</h3><button type="button" aria-label="다음 주" onClick={()=>setDay(offsetDay(day,7))}>›</button><button type="button" onClick={()=>setDay(seoulDay())}>이번 주</button><label>조회 주<input type="date" value={day} onInput={e=>{if(e.currentTarget.value)setDay(e.currentTarget.value);}}/></label></div>
    <details className="timetable-pending" open={pending.length>0&&!visible.some(l=>l.time)}><summary>요일·시간 미설정 <b>{pending.length}</b></summary>{pending.length?<div className="timetable-student-list">{pending.map(({student,account})=><button type="button" key={student.id} disabled={busy||!account} onClick={()=>account&&edit(account)}><strong>{displayEnrollmentName(student)}</strong><small>{account?`${scheduleLabel(account.schedule,days[6])} · 시간 설정`:'총 등록 현황에서 수강 등록 필요'}</small></button>)}</div>:<p>선택한 학생들의 요일·시간이 모두 설정되어 있습니다.</p>}</details>
    <div className="timetable-scroll"><table className="timetable-table"><caption className="sr-only">월요일부터 일요일까지 오전 10시부터 오후 10시까지 수업 시간표</caption><thead><tr><th scope="col">시간</th>{days.map(d=><th scope="col" key={d} className={`${d===seoulDay()?'is-today ':''}${new Date(`${d}T00:00:00Z`).getUTCDay()===0?'sunday':new Date(`${d}T00:00:00Z`).getUTCDay()===6?'saturday':''}`}><span>{d.slice(5).replace('-','/')} ({WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]})</span>{ACADEMY_DAYS[d]&&<small>{ACADEMY_DAYS[d].label}</small>}</th>)}</tr></thead><tbody>
    {TIME_SLOTS.map((time,n)=><tr key={time} className={n%2?'half-hour':''}><th scope="row">{time}</th>{days.map(d=><td key={d} className={`${academyClosed(d)?'closed ':''}${d===seoulDay()?'is-today':''}`}>{visible.filter(l=>l.day===d&&l.time&&lessonSlot(l.time)===n).map(card)}</td>)}</tr>)}<tr className="timetable-end"><th scope="row">22:00</th>{days.map(d=><td key={d}/>)}</tr>
    </tbody></table></div>

  </div>;
}
