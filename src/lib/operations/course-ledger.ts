import { attendanceSequence } from './attendance-sequence';
import { passUnitsOn } from './pass-history';
import { passStart, receiptComplete } from './pass-settlement';
import type { Account, Attendance, Invoice, LegacyAttendance, Payment } from './model';
import type { LessonReference } from './lesson-reference';

export type LessonSlot = { ordinal:number; originDay:string; attendanceIds:string[]; makeupDays:string[]; state:'unused'|'scheduled'|'completed'|'makeup-due'; charged:number; imported:boolean };
export type CoursePass = { id:string; start:string; units:number; invoiceId:string; amount:number; paid:number; paymentStatus:'unpaid'|'partial'|'paid'|'review'; receiptIds:string[]; slots:LessonSlot[]; regularRemaining:number; makeupOutstanding:number };
export type SlotBinding = { attendanceId:string; passId:string; ordinal:number; originDay:string };
export type CourseLedger = { version:1; studentId:string; name:string; passes:CoursePass[]; bindings:SlotBinding[]; issues:string[]; currentRemaining:number; makeupOutstanding:number; repair:null|{start:string; units:number; amount:number; expectedRemaining:number; attendanceIds:string[]; previousInvoiceId:string} };
export type LedgerSheetSource={source:string;cells:{day:string;value:string;color:string;cell:string;sheet:string}[];history:Attendance[];note:string;updatedAt:string};
export type LedgerEvidence = { sheet?:LedgerSheetSource; account:Account; attendance:Attendance[]; invoices:Invoice[]; payments:Payment[]; references:LessonReference[]; legacy:LegacyAttendance[] };

/** A reproducible, event-backed read model. Attendance and receipts are source
 * events, never synthesized from a balance. Unassigned slots are future rights,
 * not attendance; a makeup completes its original slot even across passes. */
export function buildCourseLedger(evidence:LedgerEvidence,today:string):CourseLedger {
 const {account:a}=evidence,id=a.id;
 const records=evidence.attendance.filter(r=>r.studentId===id).sort((x,y)=>x.day.localeCompare(y.day));
 const bills=evidence.invoices.filter(i=>i.studentId===id&&i.status!=='cancelled');
 const payments=evidence.payments.filter(p=>p.studentId===id&&!p.cancelledAt);
 const refs=evidence.references.filter(r=>r.studentId===id),legacy=evidence.legacy.filter(r=>r.studentId===id);
 const seq=attendanceSequence([a],records,legacy,{positions:{},references:refs,cycleStarts:[...(a.passHistory||[]).map(h=>({studentId:id,day:h.start})),...bills.filter(i=>passStart(i)).map(i=>({studentId:id,day:passStart(i)}))]});
 const datedStarts=bills.map(passStart).filter(Boolean).sort();
 // History before the first evidenced pass may begin mid-cycle. Never present
 // the sequence adapter's initial counter as a newly purchased/unpaid pass.
 const starts=[...new Set([...(seq.cycleFirstDays[id]||[]),...datedStarts])].filter(start=>!datedStarts.length||start>=datedStarts[0]).sort();
 const issues:string[]=[];
 const passes:CoursePass[]=starts.map(start=>{
  const matching=bills.filter(i=>passStart(i)===start),invoice=matching.length===1?matching[0]:undefined;
  const units=invoice?.units||passUnitsOn(a,start),receipts=invoice?payments.filter(p=>p.invoiceId===invoice.id):[];
  const uncertain=matching.length>1||!!invoice?.linkReview||!!invoice?.needsReview|| (!!invoice&&receipts.reduce((n,p)=>n+p.amount,0)!==invoice.paid);
  if(uncertain)issues.push(`${start}: 청구와 실제 수납 연결 확인 필요`);
  return {id:invoice?.passId||invoice?.id||`cycle_${id}_${start}`,start,units,invoiceId:invoice?.id||'',amount:invoice?.amount||a.planAmount,paid:invoice?.paid||0,paymentStatus:uncertain||!invoice?'review':receiptComplete(invoice)?'paid':invoice.paid?'partial':'unpaid',receiptIds:receipts.map(p=>p.id),slots:Array.from({length:units},(_,n)=>({ordinal:n+1,originDay:'',attendanceIds:[],makeupDays:[],state:'unused',charged:0,imported:false})),regularRemaining:units,makeupOutstanding:0};
 });
 const bindings:SlotBinding[]=[];
 const byDay=new Map(records.map(r=>[r.day,r]));
 const events=new Map([...legacy,...refs,...records].map(r=>[r.day,r]));
 const passOn=(day:string)=>passes.filter(p=>p.start<=day).at(-1);
 for(const [day,event] of [...events].sort(([x],[y])=>x.localeCompare(y))){
  const row=byDay.get(day),status=row?.status||'present';
  if(['cancelled','paused','makeup','makeup_reserved'].includes(status))continue;
  const label=seq.labels.get(`${id}_${day}`)||('value' in event?String(event.value):'');
  const ordinals=label.split('·').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
  let pass=passOn(day);if(!pass)continue;
  const firstIndex=ordinals.indexOf(1);
  for(let n=0;n<ordinals.length;n++){
   const split=row?.passAllocations?.find(p=>ordinals[n]>=p.firstOrdinal&&ordinals[n]<p.firstOrdinal+p.units);
   const target=split?passes.find(p=>p.id===split.passId):firstIndex>0&&n<firstIndex?passes[passes.indexOf(pass)-1]:pass;
   const slot=target?.slots[ordinals[n]-1];if(!slot){issues.push(`${day}: 수강권 회차 범위 확인 필요`);continue;}
   if(slot.originDay&&slot.originDay!==day){issues.push(`${day}: ${target!.start} 수강권 ${slot.ordinal}회차 중복`);continue;}
   slot.originDay=day;slot.imported=!row;
   if(row){slot.attendanceIds.push(row.id);bindings.push({attendanceId:row.id,passId:target!.id,ordinal:slot.ordinal,originDay:day});slot.charged+=Math.min(1,Math.max(0,row.units-n));}
   slot.state=slot.charged>0?'completed':['absent','travel','sick','late_cancel'].includes(status)?'makeup-due':'scheduled';
  }
 }
 // Second pass resolves both advance makeups and makeups for old passes.
 for(const row of records.filter(r=>['makeup','makeup_reserved'].includes(r.status||'')&&r.relatedDay)){
  const pass=passOn(row.relatedDay!),slots=pass?.slots.filter(s=>s.originDay===row.relatedDay)||[];
  if(!slots.length){issues.push(`${row.day}: 보강 원수업 회차 확인 필요`);continue;}
  for(const slot of slots){
   slot.makeupDays.push(row.day);slot.attendanceIds.push(row.id);bindings.push({attendanceId:row.id,passId:pass!.id,ordinal:slot.ordinal,originDay:row.relatedDay!});
   if(row.status==='makeup'){slot.charged+=row.units/slots.length;slot.state='completed';}
   if(slot.charged>1)issues.push(`${row.day}: 원수업과 보강의 중복 차감 확인 필요`);
  }
 }
 for(const p of passes){p.regularRemaining=p.slots.filter(s=>s.state==='unused'||s.state==='scheduled').length;p.makeupOutstanding=p.slots.filter(s=>s.state==='makeup-due').length;}
 for(const i of bills.filter(i=>i.paid>0&&!passStart(i)))issues.push(`${i.id}: 기존 수납의 첫 수업일 확인 필요`);
 for(const r of records){const bs=bindings.filter(b=>b.attendanceId===r.id);if(r.passId&&bs.length===1&&bs[0].passId!==r.passId)issues.push(`${r.day}: 출석의 수강권 연결 불일치`);}
 const current=passes.filter(p=>p.start<=today).at(-1);
 let repair:CourseLedger['repair']=null;
 // Only a complete, recorded preceding cycle and an unambiguous current cycle
 // authorize a missing unpaid pass. Imported/ambiguous histories are review-only.
 if(current&&!current.invoiceId&&!a.nextPass&&a.active){
  const prev=passes[passes.indexOf(current)-1],first=byDay.get(current.start);
  const actualCurrent=records.filter(r=>r.day>=current.start&&r.day<=today&&!['cancelled','paused'].includes(r.status||''));
  const currentBindings=bindings.filter(b=>b.passId===current.id);
  const ids=[...new Set(currentBindings.map(b=>b.attendanceId))];
  const expected=current.units-current.slots.filter(s=>s.state==='completed').length;
  const priorComplete=prev&&prev.invoiceId&&prev.paymentStatus!=='review'&&prev.slots.every(s=>s.originDay&&s.originDay<current.start&&!s.imported);
  const knownHistory=actualCurrent.every(r=>ids.includes(r.id)||r.relatedDay&&r.relatedDay<current.start);
  const unknown=bills.some(i=>!passStart(i)||i.linkReview||i.needsReview||passStart(i)>current.start);
  const conflicting=evidence.invoices.some(i=>i.status==='cancelled'&&passStart(i)===current.start);
  const structural=issues.some(i=>!i.endsWith('출석의 수강권 연결 불일치'));
  if(priorComplete&&first&&['present','late_cancel'].includes(first.status||'present')&&first.units===1&&knownHistory&&!unknown&&!conflicting&&!structural&&expected>=0&&a.remaining===expected&&current.units===a.planUnits){
   repair={start:current.start,units:current.units,amount:a.planAmount,expectedRemaining:expected,attendanceIds:ids,previousInvoiceId:prev.invoiceId};
  }
 }
 return {version:1,studentId:id,name:a.name,passes,bindings,issues,currentRemaining:a.remaining,makeupOutstanding:passes.filter(p=>p!==current&&p.start<=today).reduce((n,p)=>n+p.makeupOutstanding,0),repair};
}
