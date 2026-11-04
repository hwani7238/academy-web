import type { Account, Attendance, Invoice } from './model';
import { plannedLesson } from './schedule';

/** Source attendance and receipts stay untouched. These are reproducible lesson
 * allocations. A pass owns its slots; a makeup consumes its source slot. */
export type LedgerPassSeed = { id:string; invoiceId:string; start:string; units:number; amount:number; openingUsed?:number; openingOrdinal?:number; fixedStart?:boolean; archived?:boolean };
export type LedgerAdjustment = { id:string; passId:string; units:number; reason:string; at:string };
export type ArchivedLesson = { day:string; passId:string; ordinal:number|null; charged:number; makeupEligible:boolean };
export type LessonLedgerSeed = { version:2; from:string; passes:LedgerPassSeed[]; archived:ArchivedLesson[]; adjustments:LedgerAdjustment[]; createdAt:string; sourceFingerprint:string };
export type AllocatedLesson = { id:string; passId:string; ordinal:number; day:string; attendanceIds:string[]; makeupDays:string[]; charged:number; reserved:boolean; projected:boolean };
export type ProjectedPass = LedgerPassSeed & { slots:AllocatedLesson[]; charged:number; remaining:number; usedOrdinal:number; actual:boolean };
export type LessonLedgerProjection = { version:2; passes:ProjectedPass[]; labels:Record<string,string>; assignments:Record<string,{passId:string;ordinal:number;sourceDay:string}[]>; currentPassId:string; currentRemaining:number; previousMakeups:number; currentMakeups:number; issues:string[] };
export type LedgerAttendance = Attendance & { projected?:boolean };
const regular = (r:LedgerAttendance) => !['makeup','makeup_reserved','paused','cancelled'].includes(r.status||'present');
const dayOf=(i:Invoice)=>i.lessonDate||i.cycleStart||'';

export function projectLessonLedger(account:Account,seed:LessonLedgerSeed,attendance:LedgerAttendance[],invoices:Invoice[],today:string,reflowFrom?:string):LessonLedgerProjection {
 const rows=attendance.filter(r=>r.studentId===account.id).sort((a,b)=>a.day.localeCompare(b.day)||a.id.localeCompare(b.id));
 const bills=invoices.filter(i=>i.studentId===account.id&&i.status!=='cancelled');
 const issues:string[]=[],labels:Record<string,string>={},assignments:LessonLedgerProjection['assignments']={};
 const definitions=seed.passes.filter(p=>!p.invoiceId||bills.some(i=>i.id===p.invoiceId)).map(p=>{
  const i=bills.find(i=>i.id===p.invoiceId);
  return {...p,...(i?{start:dayOf(i)||p.start,units:i.units,amount:i.amount}:{})};
 });
 for(const i of bills)if(!definitions.some(p=>p.invoiceId===i.id)&&dayOf(i)>=seed.from&&!i.reservedPass)definitions.push({id:i.passId||i.id,invoiceId:i.id,start:dayOf(i),units:i.units,amount:i.amount,fixedStart:i.renewalReservation?.mode==='date'});
 definitions.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
 if(!definitions.length)return {version:2,passes:[],labels,assignments,currentPassId:'',currentRemaining:0,previousMakeups:0,currentMakeups:0,issues:['계산 시작 수강권을 확인해주세요.']};
 const passes:ProjectedPass[]=definitions.map(p=>({...p,slots:[],charged:p.openingUsed||0,remaining:p.units-(p.openingUsed||0),usedOrdinal:p.openingOrdinal||0,actual:!!p.openingUsed}));
 const archived=new Map(seed.archived.map(s=>[s.day,{...s,charged:s.charged,makeupDays:[] as string[]}]));
 let cursor=0;
 const anchor=reflowFrom?passes.filter(p=>p.start<reflowFrom).at(-1)||passes.find(p=>p.start===reflowFrom):undefined;
 const reflowStart=anchor?.start;
 const pending=bills.filter(i=>i.allocationState==='pending'&&!dayOf(i)&&!i.reservedPass);
 const bind=(id:string,p:ProjectedPass,s:AllocatedLesson)=>{(assignments[id]||=[]).push({passId:p.id,ordinal:s.ordinal,sourceDay:s.day});};
 function advance(day:string){
  const prev=passes[cursor],next=passes[cursor+1];
  if(next){cursor++;if(!next.fixedStart&&((reflowStart&&prev.start>=reflowStart)||bills.find(i=>i.id===next.invoiceId)?.allocationState==='pending'))next.start=day;return next;}
  const reservation=account.nextPass;
  const reserved=reservation&&(reservation.mode==='date'?day>=reservation.start:day>=reservation.reservedOn)?bills.find(i=>i.id===reservation.invoiceId):undefined;
  const candidate=reserved||pending.find(i=>!passes.some(p=>p.invoiceId===i.id));
  const p:ProjectedPass={id:candidate?.passId||candidate?.id||`lesson_${account.id}_${day}_${passes.length}`,invoiceId:candidate?.id||'',start:day,units:candidate?.units||prev.units,amount:candidate?.amount||prev.amount,slots:[],charged:0,remaining:candidate?.units||prev.units,usedOrdinal:0,actual:false};
  passes.push(p);cursor=passes.length-1;return p;
 }
 for(const row of rows.filter(r=>r.day>=seed.from&&regular(r))){
  const missed=['absent','travel','sick','late_cancel'].includes(row.status||'present');
  if(missed&&row.range&&!plannedLesson(account.schedule,row.day))continue;
  const count=Math.max(row.units,missed?1:0);if(!count)continue;
  // Historical invoice boundaries are retained until an explicit past edit
  // replays their suffix. Dated plan changes always retain their effective day.
  while(passes[cursor+1]&&!(bills.find(i=>i.id===passes[cursor+1].invoiceId)?.allocationState==='pending'&&!dayOf(bills.find(i=>i.id===passes[cursor+1].invoiceId)!))&&passes[cursor+1].start<=row.day&&(!reflowStart||passes[cursor+1].start<=reflowStart||passes[cursor+1].fixedStart))cursor++;
  const reservation=account.nextPass;
  if(reservation?.mode==='date'&&row.day>=reservation.start&&row.status==='present'&&!passes.some(p=>p.invoiceId===reservation.invoiceId)){
   const invoice=bills.find(i=>i.id===reservation.invoiceId);
   if(invoice){passes.push({id:invoice.passId||invoice.id,invoiceId:invoice.id,start:row.day,units:invoice.units,amount:invoice.amount,fixedStart:true,slots:[],charged:0,remaining:invoice.units,usedOrdinal:0,actual:false});cursor=passes.length-1;}
  }
  const numbers:number[]=[];
  for(let n=0;n<count;n++){
   let p=passes[cursor];if(p.usedOrdinal>=p.units)p=advance(row.day);
   const ordinal=++p.usedOrdinal,charged=row.projected?0:n<row.units?1:0;
   const slot:AllocatedLesson={id:`${p.id}:${ordinal}`,passId:p.id,ordinal,day:row.day,attendanceIds:[row.id],makeupDays:[],charged,reserved:missed,projected:!!row.projected};
   p.slots.push(slot);p.charged+=charged;p.actual ||= !row.projected&&row.day<=today;
   bind(row.id,p,slot);numbers.push(ordinal);
  }
  labels[`${account.id}_${row.day}`]=numbers.join('·');
 }
 for(const row of rows.filter(r=>['makeup','makeup_reserved'].includes(r.status||''))){
  if(!row.relatedDay){issues.push(`${row.day}: 보강 원수업 날짜 확인 필요`);continue;}
  const source=passes.flatMap(p=>p.slots.map(s=>({p,s}))).filter(({s})=>s.day===row.relatedDay);
  if(source.length){
   if(source.some(({s})=>!s.reserved)){issues.push(`${row.day}: 결석·여행으로 예약된 원수업이 아닙니다.`);continue;}
   let charge=row.status==='makeup'&&!row.projected?row.units:0;
   for(const {p,s} of source){
    s.makeupDays.push(row.day);s.attendanceIds.push(row.id);bind(row.id,p,s);
    if(charge>0&&s.charged<1){s.charged++;p.charged++;charge--;p.actual ||= row.day<=today;}
   }
   if(charge>0)issues.push(`${row.day}: 같은 원수업을 중복 차감할 수 없습니다.`);
   labels[`${account.id}_${row.day}`]=source.map(({s})=>s.ordinal).join('·');
  }else{
   const old=archived.get(row.relatedDay);
   if(!old||!old.makeupEligible){issues.push(`${row.day}: 이전 보강 원수업 확인 필요 (${row.relatedDay})`);continue;}
   const amount=row.status==='makeup'&&!row.projected?row.units:0;
   old.charged+=amount;old.makeupDays.push(row.day);
   if(old.charged>1)issues.push(`${row.day}: 이전 원수업 중복 차감 확인 필요`);
   if(old.ordinal)labels[`${account.id}_${row.day}`]=String(old.ordinal);
   assignments[row.id]=[{passId:old.passId,ordinal:old.ordinal||0,sourceDay:old.day}];
  }
 }
 for(const p of passes){
  const adjustment=seed.adjustments.filter(a=>a.passId===p.id).reduce((n,a)=>n+a.units,0);
  const usedRights=(p.openingOrdinal||0)+p.slots.filter(s=>!s.projected&&(s.day<=today||s.charged>0)).length;
  p.remaining=p.units-usedRights+adjustment;
  if(p.charged>p.units)issues.push(`${p.start}: 수강권 횟수보다 많은 차감`);
 }
 const current=passes.filter(p=>p.start<=today&&p.actual).at(-1)||passes.find(p=>p.start<=today)||passes[0];
 const completedSourceDays=new Set(rows.filter(r=>r.status==='makeup'&&!r.projected&&r.day<=today).map(r=>r.relatedDay));
 const due=(s:AllocatedLesson)=>s.reserved&&!s.projected&&s.day<=today&&!completedSourceDays.has(s.day);
 const currentMakeups=current.slots.filter(due).length;
 const previousMakeups=passes.filter(p=>p!==current&&p.start<=today).reduce((n,p)=>n+p.slots.filter(due).length,0)+[...archived.values()].filter(s=>s.makeupEligible&&!completedSourceDays.has(s.day)).length;
 return {version:2,passes,labels,assignments,currentPassId:current.id,currentRemaining:current.remaining,previousMakeups,currentMakeups,issues:[...new Set(issues)]};
}
