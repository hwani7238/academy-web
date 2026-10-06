import {attendanceForecast} from './attendance-forecast';
import {attendanceSequence} from './attendance-sequence';
import {isFirstLesson} from './attendance-appearance';
import {invoiceCycleStart} from './billing-display';
import {enrollmentState} from './lifecycle';
import {seoulDay,type Invoice,type Snapshot} from './model';
export function billingHorizon(today=seoulDay()) {return new Date(Date.parse(today)+32*86400000).toISOString().slice(0,10);}
// Forecast rows are derived from the same ordinal/schedule rules as the monthly
// register. They do not create debt, credits, or messages until the owner acts.
export function billingProjection(data:Snapshot,today=seoulDay()){
 const records=[...data.attendance,...(data.forecastAttendance||[])];
 const context=data.sequenceContext;
 const sequence=attendanceSequence(data.accounts,records,data.legacyAttendance||[],context);
 const cycles=Object.fromEntries(Object.entries(sequence.cycleFirstDays).map(([id,days])=>[id,[...days]])),times={...sequence.firstLessonTimes};
 const dates:string[]=[];for(let d=Date.parse(today);d<Date.parse(billingHorizon(today));d+=86400000)dates.push(new Date(d).toISOString().slice(0,10));
 const forecast=attendanceForecast(data.accounts,records,data.legacyAttendance||[],context,dates,today);
 const candidateKeys=new Set<string>();
 for(const [key,label] of forecast){if(!isFirstLesson(label,'present'))continue;const id=key.slice(0,-11),day=key.slice(-10);const days=cycles[id]||=[];if(!days.includes(day))days.push(day);times[key]='forecast';candidateKeys.add(key);}
 for(const row of data.attendance)if(isFirstLesson(sequence.labels.get(`${row.studentId}_${row.day}`),row.status))candidateKeys.add(`${row.studentId}_${row.day}`);
 const invoiceRows=[...data.invoices,...(data.settledInvoices||[])];
 const covered=new Set(invoiceRows.filter(i=>i.status!=='cancelled').flatMap(i=>{const day=invoiceCycleStart(i,cycles,times);return day?[`${i.studentId}_${day}`]:[];}));
 const upcoming:Invoice[]=[],seen=new Set<string>();
 if(data.day.slice(0,7)!==today.slice(0,7))return {upcoming,cycleFirstDays:cycles,firstLessonTimes:times};
 for(const key of [...candidateKeys].sort((a,b)=>a.slice(-10).localeCompare(b.slice(-10)))){
  const id=key.slice(0,-11),day=key.slice(-10),a=data.accounts.find(a=>a.id===id),s=data.students.find(s=>s.id===id);
  if(seen.has(id)||!a?.active||a.nextPass||!s||enrollmentState(s.lifecycle,today)!=='active'||enrollmentState(s.lifecycle,day)!=='active')continue;
  if(data.cancelledInvoiceKeys?.includes(key)||covered.has(key)){if(day>=today)seen.add(id);continue;}
  // An unlinked open bill must be resolved rather than duplicated.
  if(data.invoices.some(i=>i.studentId===id&&i.status==='open'&&!invoiceCycleStart(i,cycles,times)))continue;
  seen.add(id);upcoming.push({id:`upcoming_${id}_${day}`,studentId:id,name:a.name,units:a.planUnits,amount:a.planAmount,paid:0,status:'open',needsReview:false,createdAt:`${today}T00:00:00.000Z`,lessonDate:day,projected:true});
 }
 return {upcoming,cycleFirstDays:cycles,firstLessonTimes:times};
}
