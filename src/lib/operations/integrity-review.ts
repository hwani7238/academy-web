import {buildCourseLedger,buildCanonicalCourseLedger,type LedgerEvidence} from './course-ledger';
import {inspectBilling,type IntegrityIssue} from './billing-integrity';
import {projectLessonLedger,type LessonLedgerSeed} from './lesson-ledger';
import {plannedLesson} from './schedule';
import {courseLifecycle,enrollmentState} from './lifecycle';
import {seoulDay,type Payment} from './model';
import {paymentDay} from './billing-display';
export type ReviewEntry={studentId:string;name:string;checked:boolean;checkedAt:string;issues:IntegrityIssue[]};
export type ReviewContext={owner?:Parameters<typeof courseLifecycle>[0];seed?:LessonLedgerSeed};
export const reviewDay=(now=new Date())=>{const day=seoulDay(now),hour=new Date(now.getTime()+9*3600000).getUTCHours();return hour<12?previousDay(day):day;};
export function previousDay(day:string){return new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);}
export function lastDayOfMonth(month:string){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);}
export function closedAttendanceDay(now=new Date()){const local=new Date(now.getTime()+9*3600000);return local.getUTCHours()*60+local.getUTCMinutes()>=23*60+30?seoulDay(now):previousDay(seoulDay(now));}
export function reviewAccount(e:LedgerEvidence,ctx:ReviewContext,day:string,attendanceDays:string[],stamp:string):ReviewEntry{
 const a=e.account,issues:IntegrityIssue[]=[];
 const issue=(kind:string,reason:string,date='')=>issues.push({studentId:a.id,name:a.name,kind,day:date,reason,automatic:false});
 if(!a.active)return {studentId:a.id,name:a.name,checked:false,checkedAt:stamp,issues};
 if(!ctx.owner)issue('missing-student','수강 설정에 연결된 학생 등록 정보가 없습니다. 이전 또는 중복 등록인지 확인해주세요.');
 const ledger=a.ledgerVersion===2&&ctx.seed?buildCanonicalCourseLedger(e,ctx.seed,day):buildCourseLedger(e,day);
 if(a.ledgerVersion===2&&!ctx.seed)issue('ledger-missing','회차 계산 근거를 찾을 수 없습니다. 출결·수납 원본은 유지됩니다.');
 for(const reason of ledger.issues)issue('ledger-review',reason);
 if(a.ledgerVersion!==2){const legacy=inspectBilling(a,e.invoices,e.attendance,e.references,e.legacy,day,stamp);for(const i of legacy.issues)issues.push({...i,automatic:false});}
 if(ctx.seed&&a.ledgerVersion===2){const p=projectLessonLedger(a,ctx.seed,e.attendance,e.invoices,day);if(p.currentRemaining!==a.remaining)issue('balance-review',`저장 잔여 ${a.remaining}회와 출결 기준 ${p.currentRemaining}회가 다릅니다. 다음 출결 처리 또는 원장 확인이 필요합니다.`);}
 if(!Number.isSafeInteger(a.planUnits)||a.planUnits<1||!Number.isFinite(a.planAmount)||a.planAmount<1)issue('course-settings','수강권 횟수 또는 수강료를 확인해주세요.');
 const facts=new Map([...(ctx.seed?.history||[]),...e.attendance].map(r=>[r.day,r]));
 const legacyDays=new Set(e.legacy.map(r=>r.day));
 const lifecycle=ctx.owner?courseLifecycle(ctx.owner,a.id):undefined;
 for(const d of [...new Set(attendanceDays)]){
  if(d>day||!ctx.owner||enrollmentState(lifecycle,d)!=='active')continue;
  const first=a.currentPassStart||'';if(!facts.size&&first&&d<first)continue;
  if(!plannedLesson(a.schedule,d))continue;
  const fact=facts.get(d);
  if(fact?.status==='makeup_reserved')issue('attendance-missing','보강 예약일이 지났지만 실제 출석 여부가 기록되지 않았습니다.',d);
  else if(!fact&&!legacyDays.has(d))issue('attendance-missing','수업 예정일에 출결 기록이 없습니다. 실제 수업·결석·일시 정지 여부를 확인해주세요.',d);
 }
 const seen=new Set<string>();
 return {studentId:a.id,name:a.name,checked:true,checkedAt:stamp,issues:issues.filter(i=>{const key=[i.kind,i.day,i.reason].join('|');if(seen.has(key))return false;seen.add(key);return true;})};
}
export function monthlyReview(evidence:LedgerEvidence[],month:string,stamp:string,allPayments:Payment[]=[]){
 const payments=new Map<string,Payment>(allPayments.map(p=>[p.id,p]));for(const e of evidence)for(const p of e.payments)payments.set(p.id,p);
 const active=[...payments.values()].filter(p=>!p.cancelledAt&&paymentDay(p).startsWith(month));
 const byMethod:Record<string,number>={},issues:IntegrityIssue[]=[],seen=new Set<string>();let amount=0;
 const owner=new Map(evidence.map(e=>[e.account.id,e.account.name]));
 for(const p of active){if(!owner.has(p.studentId))issues.push({studentId:p.studentId,name:'연결되지 않은 수납',day:p.paymentDate||'',kind:'missing-student',reason:'수납에 연결된 수강 설정이 없습니다. 금액은 월 합계에 포함했습니다.',automatic:false});amount+=p.amount;byMethod[p.method]=(byMethod[p.method]||0)+p.amount;const key=[p.studentId,p.invoiceId,p.paymentDate,p.amount,p.method].join('|');
  if(!p.paymentDate)issues.push({studentId:p.studentId,name:owner.get(p.studentId)||'수납 기록',day:paymentDay(p),kind:'payment-date',reason:'실제 결제일이 없어 입력일 기준으로 월 합계에 포함했습니다. 결제일 확인이 필요합니다.',automatic:false});
  if(seen.has(key))issues.push({studentId:p.studentId,name:owner.get(p.studentId)||'수납 기록',day:p.paymentDate||'',kind:'duplicate-receipt',reason:`같은 날짜·수단·금액(${p.amount.toLocaleString()}원)의 수납이 반복됩니다. 실제 중복 여부를 확인해주세요.`,automatic:false});seen.add(key);
 }
 let attendanceCount=0,chargedUnits=0;
 for(const e of evidence){for(const a of e.attendance.filter(r=>r.day.startsWith(month)&&r.status!=='cancelled'&&r.status!=='paused')){attendanceCount++;chargedUnits+=a.units;}
  for(const i of e.invoices.filter(i=>i.status!=='cancelled')){const receipts=e.payments.filter(p=>p.invoiceId===i.id&&!p.cancelledAt);if(!receipts.some(p=>active.some(a=>a.id===p.id)))continue;const actual=receipts.reduce((n,p)=>n+p.amount,0);if(actual!==i.paid)issues.push({studentId:e.account.id,name:e.account.name,day:i.lessonDate||'',kind:'receipt-link',reason:`청구 수납액 ${i.paid.toLocaleString()}원과 실제 기록 ${actual.toLocaleString()}원이 다릅니다.`,automatic:false});}
 }
 return {month,checkedAt:stamp,through:lastDayOfMonth(month),receiptCount:active.length,amount,byMethod,attendanceCount,chargedUnits,issues};
}
