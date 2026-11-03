import {attendanceSequence} from './attendance-sequence';
import {isFirstLesson} from './attendance-appearance';
import {passDay} from './pass-link';
import type {LessonReference} from './lesson-reference';
import type {Account,Attendance,Invoice,Snapshot} from './model';
export type IntegrityIssue={studentId:string;name:string;kind:string;day:string;reason:string;automatic:boolean};
export type IntegrityPlan={issue:IntegrityIssue;invoice:Invoice;account:Account;attendance:Attendance[]};
export function inspectBilling(account:Account,invoices:Invoice[],records:Attendance[],references:LessonReference[],legacy:NonNullable<Snapshot['legacyAttendance']>,today:string,stamp:string){
 const id=account.id,issues:IntegrityIssue[]=[],plans:IntegrityPlan[]=[];
 const issue=(kind:string,day:string,reason:string,automatic=false)=>{const i={studentId:id,name:account.name,kind,day,reason,automatic};issues.push(i);return i;};
 if(!account.active)return {issues,plans};
 const bills=invoices.filter(i=>i.studentId===id&&i.status!=='cancelled'),rows=records.filter(r=>r.studentId===id&&r.day<=today).sort((a,b)=>a.day.localeCompare(b.day));
 const refs=references.filter(r=>r.studentId===id),old=legacy.filter(r=>r.studentId===id);
 const dated=bills.filter(i=>passDay(i)).sort((a,b)=>passDay(a).localeCompare(passDay(b)));
 const seq=attendanceSequence([account],rows,old,{positions:{},references:refs,cycleStarts:[...(account.passHistory||[]).map(p=>({studentId:id,day:p.start})),...dated.map(i=>({studentId:id,day:passDay(i)}))]});
 const actual=new Map(rows.map(r=>[r.day,r]));
 const starts=new Set(rows.filter(r=>isFirstLesson(seq.labels.get(`${id}_${r.day}`),r.status)).map(r=>r.day));
 for(const r of rows)if(r.unpaidCycleStart&&r.unpaidCycleStart<=today)starts.add(r.unpaidCycleStart);
 const unknown=bills.filter(i=>!passDay(i)&&!i.reservedPass);
 for(const i of unknown.filter(i=>i.paid>0||i.allocationState==='allocated'||i.linkReview))issue('unlinked-invoice','',`${i.paid>0?'납부':'미납 청구'} ${i.amount.toLocaleString('ko-KR')}원의 적용 수강권 시작일이 없습니다.`);
 for(const i of bills.filter(i=>i.linkReview))issue('receipt-link',passDay(i),'이전 수납의 수강권 연결 확인이 필요합니다.');
 for(const day of [...starts].sort()){
  const matching=dated.filter(i=>passDay(i)===day);
  if(matching.length>1){issue('duplicate-invoice',day,'같은 1회차 날짜에 청구가 여러 개 연결돼 있습니다.');continue;}
  if(matching.length)continue;
  const row=actual.get(day),previous=dated.filter(i=>passDay(i)<day).at(-1);
  if(!previous&&!rows.some(r=>r.unpaidCycleStart===day))continue; // Earlier imported cycles predate the first reliably linked bill.
  if(invoices.some(i=>i.studentId===id&&i.status==='cancelled'&&passDay(i)===day)){issue('cancelled-invoice',day,'1회차에 취소된 청구가 있습니다. 취소 사유를 확인해주세요.');continue;}
  if(!row||!['present','late_cancel'].includes(row.status||'present')||row.units!==1){issue('missing-invoice',day,'미결제 1회차에 청구가 없습니다. 출석 또는 같은 날 여러 회 수업의 연결을 확인해주세요.');continue;}
  if(!previous||previous.allocationState!=='allocated'||previous.linkReview||(previous.allocatedUnits??previous.units)!==previous.units||account.nextPass||dated.some(i=>passDay(i)>day)||unknown.some(i=>i.paid>0||i.allocationState==='allocated')||unknown.length>1){issue('missing-invoice',day,'1회차 청구가 없지만 이전 납부·예약 수강권과의 관계를 확인해야 합니다.');continue;}
  const prior=rows.filter(r=>r.day>=passDay(previous)&&r.day<day);
  const missingEvidence=[...refs,...old].some(r=>r.day>=passDay(previous)&&r.day<day&&!actual.has(r.day));
  const used=prior.reduce((n,r)=>n+r.units,0);
  const later=rows.filter(r=>r.day>=day);
  if([...starts].some(start=>start>passDay(previous)&&start<day&&!dated.some(i=>passDay(i)===start))||missingEvidence||prior.some(r=>r.passAllocations?.length)||used!==previous.units||prior.some(r=>r.relatedDay&&r.relatedDay<passDay(previous))||later.some(r=>r.relatedDay&&r.relatedDay<day)||account.passHistory?.some(p=>p.start>passDay(previous)&&p.start<=day)){
   issue('missing-invoice',day,`1회차 청구가 없습니다. 이전 ${previous.units}회권의 전산 차감은 ${used}회이며, 이관 기록·보강·수강권 변경을 확인해야 합니다.`);continue;
  }
  const pending=unknown[0],units=pending?.units||account.planUnits,amount=pending?.amount||account.planAmount;
  const consumed=later.reduce((n,r)=>n+r.units,0);
  // Old exhaustion bills predate allocation metadata. Only reuse one when the
  // complete prior pass and the negative balance independently prove no credit.
  const legacyPending=pending&&!pending.allocationState&&pending.paid===0&&pending.creditUnits===undefined&&account.remaining===-consumed&&['수동 출결 기록 후 소진','수업 횟수 소진','횟수 수정 후 소진'].includes((pending as Invoice&{reason?:string}).reason||'');
  if(units<=0||amount<=0||consumed>units||later.some(r=>r.passAllocations?.length)|| (pending&&pending.allocationState!=='pending'&&!legacyPending)){issue('missing-invoice',day,'여러 수강권의 차감 또는 기존 청구의 횟수 반영 상태를 확인해야 합니다.');continue;}
  const invoiceId=pending?.id||`integrity_${id}_${day}`;
  const invoice:Invoice={...pending,id:invoiceId,studentId:id,name:account.name,units,amount,paid:pending?.paid||0,status:'open',needsReview:false,linkReview:false,passId:invoiceId,lessonDate:day,cycleStart:day,createdAt:pending?.createdAt||stamp,updatedAt:stamp,creditUnits:0,legacyCreditUnits:units,allocationState:'allocated',allocatedUnits:units,allocationAt:stamp};
  const problem=issue('missing-invoice',day,'이전 수강권 사용 완료와 새 1회차가 확인돼 누락 청구·출석 연결·잔여를 복구할 수 있습니다.',true);
  plans.push({issue:problem,invoice,account:{...account,remaining:units-consumed,currentPassId:invoiceId,currentPassStart:day,lastPassLessonDay:later.filter(r=>r.units>0).at(-1)?.day||day,openInvoiceId:invoiceId,updatedAt:stamp},attendance:[...prior,...later].filter(r=>r.passId!==(r.day<day?(previous.passId||previous.id):invoiceId)).map(r=>({...r,passId:r.day<day?(previous.passId||previous.id):invoiceId,updatedAt:stamp}))});
 }
 // Report differences without deriving a new first day from balances. Explicit owner dates remain authoritative.
 for(const i of dated){
  const end=dated.find(n=>passDay(n)>passDay(i));
  const period=rows.filter(r=>r.day>=passDay(i)&&(!end||r.day<passDay(end)));
  for(const r of period){
   if(!r.passId||r.relatedDay||r.passAllocations?.length||r.units===0)continue;
   if(r.passId!==(i.passId||i.id))issue('wrong-pass',r.day,`출석이 ${passDay(i)} 시작 수강권과 다른 수강권에 연결돼 있습니다.`);
  }
 }
 const current=dated.filter(i=>i.allocationState==='allocated'&&passDay(i)<=today).at(-1);
 if(current&&!plans.length){
  const after=rows.filter(r=>r.day>=passDay(current));
  const used=after.reduce((n,r)=>n+(r.passAllocations?.length?r.passAllocations.filter(p=>p.passId===(current.passId||current.id)).reduce((s,p)=>s+p.units,0):r.units),0);
  const expected=current.units-used;
  if(account.remaining!==expected)issue('balance-review',passDay(current),`현재 잔여 ${account.remaining}회, 해당 수강권 전산 출석 기준 ${expected}회입니다. 이전 잔여·보강·이관 내역 확인이 필요합니다.`);
 }
 if(!dated.length&&rows.length)issue('no-pass-start','', '출석은 있으나 시작일이 확인된 수강권이 없습니다.');
 return {issues,plans};
}
