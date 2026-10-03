import type { Account, Snapshot } from './model';
import { enrollmentState } from './lifecycle';
import { lessonTimeOn, plannedLesson, ruleOn, type LessonTime } from './schedule';
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
