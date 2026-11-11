import type {Account,Attendance,Invoice,Payment} from './model';
import {passUnitsOn} from './pass-history';
import type {LessonLedgerSeed} from './lesson-ledger';

export const invoiceStart=(i:Invoice)=>i.lessonDate||i.cycleStart||'';
export const invoiceAwaitingStart=(i:Invoice)=>i.status!=='cancelled'&&(i.allocationState==='pending'||i.reservedPass||!invoiceStart(i));
export function invoiceHasUsage(i:Invoice,records:Attendance[],seed?:LessonLedgerSeed){
 const ids=new Set([i.id,i.passId].filter(Boolean));
 const linkedLesson = records.some(row => {
  // A paused or cancelled entry can retain its old pass ID after recalculation.
  // Preserve that entry, but a zero-charge pause did not use a lesson.
  if ((row.status === 'paused' || row.status === 'cancelled') && row.units === 0 &&
      !row.passAllocations?.some(allocation => allocation.units > 0)) return false;
  return ids.has(row.passId) || row.passAllocations?.some(allocation => ids.has(allocation.passId));
 });
 return i.allocationState === 'allocated' || (i.allocatedUnits || 0) > 0 || linkedLesson ||
  !!seed?.passes.some(pass => pass.invoiceId === i.id && ((pass.openingUsed || 0) > 0 || (pass.openingOrdinal || 0) > 0));
}
export function requireUnusedInvoice(i:Invoice,records:Attendance[],payments:Payment[],seed?:LessonLedgerSeed){
 if(i.paid!==0||payments.some(p=>p.invoiceId===i.id)||invoiceHasUsage(i,records,seed))throw Error('이미 사용하거나 수납 기록이 있는 수강권입니다. 기존 청구·출결·수납은 유지하고, 수강권 관리에서 다음 수강권을 변경해주세요.');
}
/** Historical/started passes retain their agreed terms. Only a not-yet-linked
 * renewal is compared with the effective enrollment contract. */
export function invoiceContractProblem(a:Account,i:Invoice,day:string){
 if(i.studentId!==a.id)return '다른 학생·과목의 수강권입니다.';
 const reservation=a.nextPass?.invoiceId===i.id?a.nextPass:i.renewalReservation;
 if(reservation)return i.units!==reservation.units||i.amount!==reservation.amount?'예약 수강권의 횟수·금액과 청구가 다릅니다. 수강권 관리에서 확인해주세요.':'';
 if(i.paid>0||i.allocationState==='allocated')return ''; // Preserve an existing contract, including historical receipts awaiting a date.
 const expected=passUnitsOn(a,day);
 if(i.units!==expected)return `적용 수강권은 ${expected}회권인데 선택한 청구는 ${i.units}회권입니다. 청구·수강권 전체 점검에서 먼저 정정해주세요.`;
 if(!invoiceStart(i)&&i.amount!==a.planAmount)return `현재 수강료 ${a.planAmount.toLocaleString()}원과 미사용 청구 ${i.amount.toLocaleString()}원이 다릅니다. 청구·수강권 전체 점검에서 먼저 정정해주세요.`;
 return '';
}
export function requireInvoiceContract(a:Account,i:Invoice,day:string){const problem=invoiceContractProblem(a,i,day);if(problem)throw Error(problem);}

export type ContractFinding={invoiceId:string;kind:string;reason:string;fix?:{units:number;amount:number}};
export function auditInvoiceContracts(a:Account,invoices:Invoice[],records:Attendance[],payments:Payment[],seed?:LessonLedgerSeed):ContractFinding[]{
 const findings:ContractFinding[]=[],live=invoices.filter(i=>i.status!=='cancelled');
 const add=(i:Invoice,kind:string,reason:string,fix?:ContractFinding['fix'])=>findings.push({invoiceId:i.id,kind,reason,...(fix?{fix}:{})});
 const undated=live.filter(i=>!invoiceStart(i)&&!i.reservedPass);
 for(const i of live){
  const receipts=payments.filter(p=>p.invoiceId===i.id&&!p.cancelledAt),sum=receipts.reduce((n,p)=>n+p.amount,0),day=invoiceStart(i);
  if(sum!==i.paid)add(i,'receipt-total',`청구 수납액 ${i.paid.toLocaleString()}원과 실제 수납 기록 합계 ${sum.toLocaleString()}원이 다릅니다.`);
  if(i.paid>i.amount||i.status==='paid'&&i.paid!==i.amount)add(i,'receipt-state','청구 금액과 수납 완료 상태가 맞지 않습니다.');
  if(day&&live.some(o=>o.id!==i.id&&invoiceStart(o)===day)||i.passId&&live.some(o=>o.id!==i.id&&o.passId===i.passId))add(i,'duplicate-contract','같은 시작일 또는 수강권에 청구가 여러 개 연결돼 있습니다.');
  if(i.reservedPass){if(a.nextPass?.invoiceId!==i.id)add(i,'orphan-reservation','예약 청구에 대응하는 다음 수강권 설정이 없습니다.');else{const issue=invoiceContractProblem(a,i,day);if(issue)add(i,'reservation-terms',issue);}continue;}
  const saved=seed?.passes.find(p=>p.invoiceId===i.id);
  if(saved&&(saved.units!==i.units||saved.amount!==i.amount))add(i,'ledger-terms',`수강권 원장 ${saved.units}회·${saved.amount.toLocaleString()}원과 청구 ${i.units}회·${i.amount.toLocaleString()}원이 다릅니다.`);
  if(!day){
   const mismatch=i.units!==a.planUnits||i.amount!==a.planAmount;
   if(mismatch){
    const known=['수업 횟수 소진','수동 출결 기록 후 소진','횟수 수정 후 소진'].includes(String((i as Invoice&{reason?:string}).reason||''))||i.allocationState==='pending';
    const safe=known&&undated.length===1&&i.status==='open'&&i.paid===0&&!payments.some(p=>p.invoiceId===i.id)&&!invoiceHasUsage(i,records,seed)&&!saved&&a.currentPassId!==i.id&&a.currentPassId!==i.passId&&!a.nextPass;
    add(i,'unused-terms',`날짜 미등록 청구 ${i.units}회·${i.amount.toLocaleString()}원 / 현재 등록 ${a.planUnits}회·${a.planAmount.toLocaleString()}원`,safe?{units:a.planUnits,amount:a.planAmount}:undefined);
   }
   if(i.paid>0)add(i,'undated-receipt','수납된 청구의 첫 수업일이 없습니다. 실제 적용 수강권 확인이 필요합니다.');
   if(undated.length>1)add(i,'multiple-undated','첫 수업일이 없는 청구가 여러 건이므로 자동으로 선택할 수 없습니다.');
  }
 }
 for(const p of payments.filter(p=>!p.cancelledAt))if(!invoices.some(i=>i.id===p.invoiceId&&i.status!=='cancelled'))findings.push({invoiceId:p.invoiceId,kind:'orphan-receipt',reason:'수납 기록에 연결된 유효한 청구가 없습니다.'});
 return findings;
}
