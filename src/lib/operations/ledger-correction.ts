import {ledgerDatabase as database} from './ledger-store';
import { hash } from './auth';
import { readCourseLedgerEvidence, ledgerFingerprint } from './course-ledger-service';
import { validDay, type Attendance, type Invoice } from './model';

/** Owner-confirmed factual linkage corrections. Receipts are retained, never
 * deleted or refunded. Balances are separately projected from lesson slots. */
export async function correctLedgerLink(input:Record<string,unknown>,actor:string){
 const studentId=String(input.studentId||''),requestId=String(input.requestId||''),reason=String(input.reason||'').trim();
 if(!/^[\w-]{1,160}$/.test(studentId)||!/^[\w-]{1,160}$/.test(requestId)||reason.length<5)throw Error('학생과 정정 사유를 확인해주세요.');
 const db=database(),auditRef=db.doc(`opsAudit/link_${hash(studentId+requestId)}`);
 return db.runTransaction(async tx=>{
  const prior=await tx.get(auditRef);if(prior.exists)return {ok:true,duplicate:true};
  const e=await readCourseLedgerEvidence(studentId,tx);
  if(input.fingerprint!==ledgerFingerprint(e))throw Error('출결·수납이 변경됐습니다. 다시 확인해주세요.');
  const stamp=new Date().toISOString();
  if(input.kind==='duplicate-receipt'){
   const keep=e.payments.find(p=>p.id===input.keepPaymentId),drop=e.payments.find(p=>p.id===input.duplicatePaymentId),target=e.invoices.find(i=>i.id===input.targetInvoiceId);
   const first=validDay(input.lessonDate);
   if(!keep||!drop||keep.id===drop.id||keep.cancelledAt||drop.cancelledAt||keep.amount!==drop.amount||keep.method!==drop.method||!target||target.status==='cancelled')throw Error('같은 과목·금액·수단의 수납 두 건과 연결할 수강권을 확인해주세요.');
   const source=e.invoices.find(i=>i.id===keep.invoiceId),duplicateInvoice=e.invoices.find(i=>i.id===drop.invoiceId);
   if(!source||!duplicateInvoice||source.id===duplicateInvoice.id)throw Error('서로 다른 수강권에 중복 연결된 수납인지 확인해주세요.');
   const affected=new Set([keep.invoiceId,drop.invoiceId,target.id]);
   if(e.invoices.some(i=>!affected.has(i.id)&&i.status!=='cancelled'&&(i.lessonDate||i.cycleStart)===first))throw Error('해당 1회차에 다른 수강권이 있습니다.');
   const payments=e.payments.map(p=>p.id===keep.id?{...p,invoiceId:target.id,passId:target.passId||target.id,lessonDate:first}:p.id===drop.id?{...p,cancelledAt:stamp,cancelledBy:actor,cancelReason:reason,duplicateOf:keep.id,revertedUnits:0}:p);
   const changed:Invoice[]=[];
   for(const id of affected){
    const old=e.invoices.find(i=>i.id===id)!;
    const paid=payments.filter(p=>p.invoiceId===id&&!p.cancelledAt).reduce((n,p)=>n+p.amount,0);
    if(paid>old.amount)throw Error('정정 후 수납 합계가 청구 금액보다 큽니다.');
    if(id!==target.id&&paid)throw Error('중복 수강권에 다른 수납이 있어 함께 확인해야 합니다.');
    changed.push(id===target.id?{...old,paid,status:paid===old.amount?'paid':'open',passId:old.passId||old.id,lessonDate:first,cycleStart:first,linkReview:false,needsReview:false,creditUnits:0,updatedAt:stamp}:{...old,paid:0,status:'cancelled',allocationState:'pending',allocatedUnits:0,creditUnits:0,updatedAt:stamp});
   }
   const targetPass=target.passId||target.id,sourcePasses=new Set([source.passId||source.id,duplicateInvoice.passId||duplicateInvoice.id]);
   const linked=e.attendance.filter(r=>r.passId&&sourcePasses.has(r.passId));
   tx.update(db.doc(`opsPayments/${keep.id}`),{invoiceId:target.id,passId:targetPass,lessonDate:first,originalInvoiceId:keep.invoiceId,linkCorrectedAt:stamp});
   tx.update(db.doc(`opsPayments/${drop.id}`),{cancelledAt:stamp,cancelledBy:actor,cancelReason:reason,duplicateOf:keep.id,revertedUnits:0});
   for(const i of changed)tx.update(db.doc(`opsInvoices/${i.id}`),i);
   for(const r of linked)tx.update(db.doc(`opsAttendance/${r.id}`),{passId:targetPass,updatedAt:stamp});
   const account={...e.account,...(sourcePasses.has(e.account.currentPassId||'')?{currentPassId:targetPass,currentPassStart:first}:{}),...(e.account.openInvoiceId&&affected.has(e.account.openInvoiceId)?{openInvoiceId:changed.find(i=>i.id===target.id)?.status==='open'?target.id:null}:{}),updatedAt:stamp};
   tx.update(db.doc(`opsAccounts/${studentId}`),account);
   tx.create(auditRef,{actor,studentId,action:'merge-duplicate-payments',at:stamp,detail:{reason,before:{payments:[keep,drop],invoices:e.invoices.filter(i=>affected.has(i.id)),account:e.account,attendance:linked},after:{payments:payments.filter(p=>p.id===keep.id||p.id===drop.id),invoices:changed,account},creditedUnits:0,remainingBefore:e.account.remaining,remainingAfter:account.remaining}});
  }else if(input.kind==='receipt-links'){
   const links=Array.isArray(input.links)?input.links as {paymentId:string;invoiceId:string;lessonDate:string;units?:number}[]:[];
   if(!links.length||links.length>10||new Set(links.map(v=>v.paymentId)).size!==links.length||new Set(links.map(v=>v.invoiceId)).size!==links.length)throw Error('연결할 수납과 수강권을 확인해주세요.');
   const changedPayments=e.payments.map(p=>({...p})),changedInvoices:Invoice[]=[];
   for(const link of links){
    const receipt=changedPayments.find(p=>p.id===link.paymentId),invoice=e.invoices.find(i=>i.id===link.invoiceId),day=validDay(link.lessonDate);
    if(!receipt||receipt.cancelledAt||!invoice||invoice.status==='cancelled'||receipt.amount>invoice.amount)throw Error('실제 수납과 수강권을 확인해주세요.');
    Object.assign(receipt,{invoiceId:invoice.id,passId:invoice.passId||invoice.id,lessonDate:day});
   }
   for(const link of links){if(link.units!==undefined&&(!Number.isInteger(link.units)||link.units<1||link.units>200))throw Error('확인된 수강권 횟수를 입력해주세요.');if(link.units!==undefined&&e.account.ledgerVersion===2)throw Error('전환된 수강권의 횟수는 수강권 변경에서 정정해주세요.');}
   const affected=new Set([...links.map(l=>l.invoiceId),...links.map(l=>e.payments.find(p=>p.id===l.paymentId)!.invoiceId)]);
   for(const id of affected){
    const old=e.invoices.find(i=>i.id===id)!;const link=links.find(l=>l.invoiceId===id),paid=changedPayments.filter(p=>p.invoiceId===id&&!p.cancelledAt).reduce((n,p)=>n+p.amount,0);
    if(paid>old.amount)throw Error('연결 후 수납 합계가 청구 금액보다 큽니다.');
    changedInvoices.push({...old,paid,status:paid===old.amount?'paid':'open',...(link?{passId:old.passId||old.id,lessonDate:link.lessonDate,cycleStart:link.lessonDate,linkReview:false,needsReview:false,...(link.units===undefined?{}:{units:link.units,...(old.allocationState==='allocated'?{allocatedUnits:link.units}:{})})}:{}),updatedAt:stamp});
   }
   const all=e.invoices.map(i=>changedInvoices.find(v=>v.id===i.id)||i),dates=all.filter(i=>i.status!=='cancelled'&&(i.lessonDate||i.cycleStart)).map(i=>i.lessonDate||i.cycleStart);
   if(new Set(dates).size!==dates.length)throw Error('같은 시작일의 수강권이 여러 개입니다.');
   for(const link of links){const old=e.payments.find(p=>p.id===link.paymentId)!,after=changedPayments.find(p=>p.id===link.paymentId)!;tx.update(db.doc(`opsPayments/${old.id}`),{invoiceId:after.invoiceId,passId:after.passId,lessonDate:after.lessonDate,originalInvoiceId:old.invoiceId,linkCorrectedAt:stamp});}
   for(const invoice of changedInvoices)tx.update(db.doc(`opsInvoices/${invoice.id}`),invoice);
   tx.create(auditRef,{actor,studentId,action:'correct-receipt-links',at:stamp,detail:{reason,before:{invoices:e.invoices.filter(i=>affected.has(i.id)),payments:e.payments.filter(p=>links.some(l=>l.paymentId===p.id))},after:{invoices:changedInvoices,payments:changedPayments.filter(p=>links.some(l=>l.paymentId===p.id))},remainingUnchanged:true}});
  }else if(input.kind==='makeup-source'){
   const edits=Array.isArray(input.links)?input.links as {attendanceId:string;sourceDay:string}[]:[];
   if(!edits.length||edits.length>10||new Set(edits.map(v=>v.attendanceId)).size!==edits.length)throw Error('보강 연결을 확인해주세요.');
   const changed:Attendance[]=[],originals:Attendance[]=[];
   for(const edit of edits){
    const row=e.attendance.find(r=>r.id===edit.attendanceId),day=validDay(edit.sourceDay);
    if(!row||!['makeup','makeup_reserved'].includes(row.status||'')||day===row.day)throw Error('보강 날짜와 원수업 날짜를 확인해주세요.');
    const original=e.attendance.find(r=>r.day===day);
    if(original&&!['absent','travel','sick','late_cancel'].includes(original.status||''))throw Error(`${day}에 다른 출석 기록이 있습니다.`);
    if(e.attendance.some(r=>r.id!==row.id&&!edits.some(x=>x.attendanceId===r.id)&&r.relatedDay===day&&['makeup','makeup_reserved'].includes(r.status||'')))throw Error(`${day}에 연결된 다른 보강이 있습니다.`);
    if(!original)originals.push({id:`${studentId}_${day}`,studentId,name:e.account.name,day,status:'absent',units:0,source:'manual',at:stamp,updatedAt:stamp,note:reason});
    changed.push({...row,relatedDay:day,updatedAt:stamp});
   }
   if(new Set(edits.map(v=>v.sourceDay)).size!==edits.length)throw Error('같은 원수업을 두 보강에 연결할 수 없습니다.');
   const facts=Array.isArray(input.facts)?input.facts as {day:string;status:string}[]:[];
   if(facts.length>10)throw Error('출결 정정 범위를 확인해주세요.');
   const factChanges:Attendance[]=[];
   for(const fact of facts){const day=validDay(fact.day),old=e.attendance.find(r=>r.day===day);if(!old||!['present','absent'].includes(fact.status))throw Error('정정할 기존 출결을 확인해주세요.');factChanges.push({...old,status:fact.status as 'present'|'absent',units:fact.status==='present'?1:0,relatedDay:'',updatedAt:stamp});}
   for(const row of factChanges)tx.update(db.doc(`opsAttendance/${row.id}`),{status:row.status,units:row.units,relatedDay:'',updatedAt:stamp});
   for(const row of originals)tx.create(db.doc(`opsAttendance/${row.id}`),row);
   for(const row of changed)tx.update(db.doc(`opsAttendance/${row.id}`),{relatedDay:row.relatedDay,updatedAt:stamp});
   tx.create(auditRef,{actor,studentId,action:'correct-makeup-source',at:stamp,detail:{reason,before:e.attendance.filter(r=>edits.some(x=>x.attendanceId===r.id)),after:changed,confirmedOrigins:originals,factChanges:factChanges.map(after=>({before:e.attendance.find(r=>r.id===after.id),after})),remainingUnchanged:true,receiptsUnchanged:true}});
  }else throw Error('지원하지 않는 연결 정정입니다.');
  return {ok:true};
 });
}
