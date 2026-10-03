import {academyClosed} from './academy-calendar';
import {seoulDay,validDay,type Account,type Snapshot,type Attendance} from './model';
import { enrollmentState } from './lifecycle';
import { changeSchedule, lessonTimeOn, plannedLesson, ruleOn, type LessonTime, type LessonSchedule } from './schedule';
import { compareStudents } from './student-order';
export function offsetDay(day: string, offset: number) {
  const date=new Date(`${day}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}
export function weekDays(day: string) {
  const weekday=new Date(`${day}T00:00:00Z`).getUTCDay();
  const monday=offsetDay(day,-((weekday+6)%7));
  return Array.from({length:7},(_,n)=>offsetDay(monday,n));
}
export const TIME_SLOTS=Array.from({length:24},(_,n)=>`${String(10+Math.floor(n/2)).padStart(2,'0')}:${n%2?'30':'00'}`);
export type TimetableLesson={student:Snapshot['students'][number];account:Account;day:string;time?:LessonTime;moved:boolean};
export function timetableLessons(data: Pick<Snapshot,'students'|'accounts'>, days:string[]) {
  const lessons:TimetableLesson[]=[], unset: {student:Snapshot['students'][number];account?:Account}[]=[];
  const accounts=new Map(data.accounts.map(a=>[a.id,a]));
  for(const student of [...data.students].sort(compareStudents)){
    const account=accounts.get(student.id);
    const available=days.filter(day=>enrollmentState(student.lifecycle,day)==='active');
    if(!available.length || account?.active===false)continue;
    let needsTime=!account || !available.some(day=>ruleOn(account.schedule,day)?.weekdays.length);
    if(account)for(const day of available){
      const planned=plannedLesson(account.schedule,day);
      if(!planned)continue;
      const time=lessonTimeOn(account.schedule,day);
      lessons.push({student,account,day,time,moved:planned.moved});
      if(!time)needsTime=true;
    }
    // Closed days still need their regular times configured for subsequent weeks.
    if(account && available.some(day=>{const r=ruleOn(account.schedule,day);return r?.weekdays.some(n=>!r.times?.[n]);}))needsTime=true;
    if(needsTime)unset.push({student,account});
  }
  lessons.sort((a,b)=>(a.time?.start||'').localeCompare(b.time?.start||'')||compareStudents(a.student,b.student));
  return {lessons,unset};
}
export function lessonSlot(time:LessonTime) {
  const [hour,minute]=time.start.split(':').map(Number);
  return (hour-10)*2+Math.floor(minute/30);
}


// Dragging changes only the schedule. It never creates attendance, credits or invoices.
export function placeTimetableLesson(old:LessonSchedule|undefined,input:Record<string,unknown>,records:Attendance[],stamp:string,today=seoulDay()):LessonSchedule {
  if((old?.updatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('수업 일정이 변경됐습니다. 다시 배치해주세요.');
  const to=validDay(input.to),from=input.from?validDay(input.from):undefined,startTime=String(input.time||'');
  if(to<today || (from && from<today))throw Error('오늘 이후 날짜에 배치해주세요. 다음 주로 넘겨서 설정할 수 있어요.');
  if(academyClosed(to))throw Error('학원 휴원일에는 수업을 배치할 수 없습니다.');
  if(!/^(1[0-9]|2[01]):[0-5]0$/.test(startTime))throw Error('10:00~21:50 사이에서 10분 단위로 선택해주세요.');
  const original=from?plannedLesson(old,from):null;
  if(from&&!original)throw Error('옮길 수업이 변경됐습니다. 다시 확인해주세요.');
  if(from && from!==to){
    if(plannedLesson(old,to))throw Error('그날에는 같은 과목 수업이 이미 있습니다. 기존 카드를 옮겨주세요.');
    if(records.some(r=>r.day===from&&(r.units>0||['present','makeup','makeup_reserved'].includes(r.status||'present'))))throw Error('출석·보강 예약·차감 기록이 있는 수업은 날짜를 옮길 수 없습니다.');
    if(records.some(r=>r.day===to&&r.status!=='cancelled'))throw Error('옮길 날짜의 출결 기록을 먼저 확인해주세요.');
  }
  const weekday=(day:string)=>new Date(`${day}T00:00:00Z`).getUTCDay();
  const previous=from?lessonTimeOn(old,from):ruleOn(old,to)?.times?.[weekday(to)];
  const minutes=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));
  let end='';
  if(previous?.end){
    const endMinutes=minutes(startTime)+minutes(previous.end)-minutes(previous.start);
    if(endMinutes>22*60)throw Error('기존 수업 길이를 유지하면 22:00를 넘습니다. 더 이른 시간에 배치해주세요.');
    end=`${String(Math.floor(endMinutes/60)).padStart(2,'0')}:${String(endMinutes%60).padStart(2,'0')}`;
  }
  const time={start:startTime,end};
  if(original?.moved && old){
    const moves=old.moves.filter(m=>m.from!==original.origin);
    moves.push({from:original.origin,to,time});
    return {...old,moves,updatedAt:stamp};
  }
  // All placements in a week share one rule, so adding weekdays out of order never loses a sibling day.
  const monday=weekDays(to)[0],start=monday<today?today:monday,base=ruleOn(old,start),target=weekday(to),source=from?weekday(from):undefined;
  if(old?.rules.some(r=>r.start>start&&r.start<=weekDays(to)[6]))throw Error('이 기간에 예약된 요일 변경이 있습니다. 학생의 요일·시간 설정에서 수정해주세요.');
  if(old?.moves.some(m=>m.to===to||m.from===to))throw Error('그날에는 개별 이동 일정이 있습니다. 해당 수업 카드를 먼저 확인해주세요.');
  const weekdays=(base?.weekdays||[]).filter(n=>source===undefined||n!==source),times={...base?.times};
  if(source!==undefined)delete times[source];
  if(source!==undefined && source!==target && weekdays.includes(target))throw Error('해당 요일에는 같은 과목 수업이 이미 설정되어 있습니다.');
  if(!weekdays.includes(target))weekdays.push(target);
  times[target]=time;
  return changeSchedule(old,{start,weekdays,times,expectedUpdatedAt:input.expectedUpdatedAt},stamp,today);
}
