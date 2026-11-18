import type { Account, Attendance } from './model';
import { enrollmentState, type Lifecycle } from './lifecycle';
import { lessonTimeOn, plannedLesson } from './schedule';

export type ExpectedLesson = { studentId: string; lessonTime: string; status: 'waiting' | 'makeup_reserved' | 'absent' | 'travel' | 'sick' | 'late_cancel' };
export const EXPECTED_LABELS = { waiting:'미출석', makeup_reserved:'보강 예정', absent:'결석', travel:'여행', sick:'병가', late_cancel:'당일 취소' } as const;
/** Read-only schedule projection. Never create attendance or deduct a lesson. */
export function dailyExpectedLessons(data: {
 accounts: Pick<Account,'id'|'active'|'schedule'>[];
 students: {id:string;lifecycle?:Lifecycle}[];
 attendance: Pick<Attendance,'studentId'|'day'|'status'>[];
}, day:string): ExpectedLesson[] {
 const records=new Map(data.attendance.filter(r=>r.day===day).map(r=>[r.studentId,r]));
 const people=new Map(data.students.map(s=>[s.id,s]));
 return data.accounts.flatMap(a=>{
  const student=people.get(a.id),record=records.get(a.id);
  if(!a.active||!student||enrollmentState(student.lifecycle,day)!=='active'||record?.status==='paused')return [];
  if(!plannedLesson(a.schedule,day)&&record?.status!=='makeup_reserved')return [];
  const status=record?.status;
  return [{studentId:a.id,lessonTime:lessonTimeOn(a.schedule,day)?.start||'',status:status&&status in EXPECTED_LABELS?status as ExpectedLesson['status']:'waiting'}];
 });
}
