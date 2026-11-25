import {projectLessonLedger} from './lesson-ledger';
import {plannedLesson} from './schedule';
import {type Account,type Attendance,type Invoice,validDay} from './model';

const startOf=(i:Invoice)=>i.lessonDate||i.cycleStart||'';
const ordinalUnits=(r:Attendance,account:Account)=>{
 if(['makeup','makeup_reserved','paused','cancelled'].includes(r.status||''))return 0;
 const missed=['absent','travel','sick','late_cancel'].includes(r.status||'');
 if(missed&&r.range&&!plannedLesson(account.schedule,r.day))return 0;
 return Math.max(r.units,missed?1:0);
};

/** Legacy previews have no pass IDs. A live allocated pass still owns its
 * remaining lessons, even if an obsolete calendar anchor calls one "1".
 * Stop at depletion so an earlier unpaid pass cannot hide a genuine renewal. */
export function currentPassInvoiceForDay(account:Account,invoices:Invoice[],records:Attendance[],day:string,today:string){
 if(account.ledgerVersion===2||day<today||Date.parse(day)-Date.parse(today)>366*86400000||!account.currentPassId||!account.currentPassStart||day<account.currentPassStart)return;
 const invoice=invoices.find(i=>i.studentId===account.id&&i.status!=='cancelled'&&(i.passId||i.id)===account.currentPassId&&i.allocationState==='allocated');
 if(!invoice)return;
 const byDay=new Map(records.filter(r=>r.studentId===account.id).map(r=>[r.day,r]));
 // Stored remaining already includes today's recorded regular lesson.
 const todayRow=byDay.get(today);
 let remaining=account.remaining+(todayRow?ordinalUnits(todayRow,account):0);
 if(remaining<=0)return;
 for(let t=Date.parse(today);t<Date.parse(day);t+=86400000){
  const d=new Date(t).toISOString().slice(0,10),r=byDay.get(d);
  remaining-=r?ordinalUnits(r,account):plannedLesson(account.schedule,d)?1:0;
  if(remaining<=0)return;
 }
 return invoice;
}

/** Explicit correction of an early legacy renewal. Only accept a complete
 * native previous cycle; missing imports or ambiguous makeup links fail closed.
 * Attendance facts and receipts remain unchanged; only pass ownership moves. */
export function correctCurrentPassBoundary(account:Account,invoice:Invoice,invoices:Invoice[],records:Attendance[],day:string,today:string){
 validDay(day);
 const oldStart=startOf(invoice),passId=invoice.passId||invoice.id;
 if(account.ledgerVersion===2||account.currentPassId!==passId||account.currentPassStart!==oldStart||invoice.status!=='open'||invoice.paid!==0||invoice.allocationState!=='allocated'||invoice.reservedPass||!oldStart||day<=oldStart||day>today)
  throw Error('현재 미납 수강권의 시작일을 뒤로 정정할 때만 사용할 수 있습니다. 수강권 상태와 날짜를 다시 확인해주세요.');
 const active=invoices.filter(i=>i.studentId===account.id&&i.status!=='cancelled');
 if(active.some(i=>i.id!==invoice.id&&((i.passId||i.id)===passId||startOf(i)>=oldStart)))throw Error('같은 기간에 다른 수강권이 있습니다. 연결을 먼저 확인해주세요.');
 const previous=active.filter(i=>startOf(i)&&startOf(i)<oldStart&&i.allocationState==='allocated').sort((a,b)=>startOf(a).localeCompare(startOf(b))).at(-1);
 if(!previous||!records.some(r=>r.day===startOf(previous)&&r.status==='present'&&r.units>0))throw Error('이전 수강권의 첫 출석부터 기록이 있어야 회차와 잔여를 함께 정정할 수 있습니다.');
 const relevant=records.filter(r=>r.studentId===account.id&&r.day>=startOf(previous));
 if(relevant.some(r=>r.passAllocations?.length||(['makeup','makeup_reserved'].includes(r.status||'')&&(!r.relatedDay||r.relatedDay<startOf(previous)))))throw Error('이전 수강권 보강 또는 여러 수강권에 나뉜 출결을 먼저 확인해주세요.');
 const corrected={...invoice,lessonDate:day,cycleStart:day,linkReview:false};
 const seed={version:2 as const,from:startOf(previous),passes:[previous,corrected].map(i=>({id:i.passId||i.id,invoiceId:i.id,start:startOf(i),units:i.units,amount:i.amount,fixedStart:true})),archived:[],adjustments:[],createdAt:'',sourceFingerprint:''};
 const projection=projectLessonLedger(account,seed,relevant,[previous,corrected],today);
 const prior=projection.passes.find(p=>p.invoiceId===previous.id),current=projection.passes.find(p=>p.invoiceId===invoice.id);
 if(projection.issues.length||projection.passes.length!==2||!prior||prior.usedOrdinal!==previous.units||!current||current.slots.some(s=>s.day<day))throw Error('정정 후 이전 수강권의 마지막 회차가 맞지 않습니다. 출결을 먼저 확인해주세요.');
 const attendance=relevant.map(r=>{const bindings=projection.assignments[r.id];return bindings?.length?{...r,passId:bindings[0].passId}:r;}).filter(r=>r.passId!==records.find(old=>old.id===r.id)?.passId);
 const updated={...account,currentPassStart:day,remaining:current.remaining,passHistory:[...(account.passHistory||[]).filter(p=>p.start!==oldStart&&p.start!==day),{start:day,units:invoice.units}].sort((a,b)=>a.start.localeCompare(b.start))};
 return {account:updated,invoice:corrected,attendance};
}
