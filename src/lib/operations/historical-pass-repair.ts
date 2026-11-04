import {database,hash} from './auth';
import {type Account,type Invoice,type Payment,type Attendance,validDay} from './model';
import {passDay} from './pass-link';
import {historicalPaymentConflict} from './historical-payment';

/** Explicit owner repair. Move the old receipt back and split the already
 * allocated current pass without crediting, charging, cancelling or paying. */
export async function repairHistoricalPass(input:Record<string,unknown>,actor:string){
 const invoiceId=String(input.invoiceId||'');
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(invoiceId))throw Error('청구를 확인해주세요.');
 const originalStart=validDay(input.originalStart),currentStart=validDay(input.currentStart);
 if(originalStart>=currentStart)throw Error('과거 수강권과 현재 수강권 날짜를 확인해주세요.');
 const db=database(),invoiceRef=db.doc(`opsInvoices/${invoiceId}`),newId=`recovered_${hash(invoiceId)}`,newRef=db.doc(`opsInvoices/${newId}`);
 return db.runTransaction(async tx=>{
  const [oldSnap,newSnap]=await Promise.all([tx.get(invoiceRef),tx.get(newRef)]);
  const old=oldSnap.data() as Invoice|undefined;
  if(!old)throw Error('수납에 연결된 청구를 찾을 수 없습니다.');
  if(newSnap.exists){
   const recovered=newSnap.data()!;
   if(recovered.recoveredFromInvoiceId===invoiceId&&recovered.studentId===old.studentId&&recovered.lessonDate===currentStart&&passDay(old)===originalStart)return;
   throw Error('이미 복구된 수강권입니다. 새로고침 후 확인해주세요.');
  }
  const accountRef=db.doc(`opsAccounts/${old.studentId}`);
  const [accountSnap,receipts,all,lessons,audits]=await Promise.all([
   tx.get(accountRef),tx.get(db.collection('opsPayments').where('invoiceId','==',invoiceId)),
   tx.get(db.collection('opsInvoices').where('studentId','==',old.studentId)),
   tx.get(db.collection('opsAttendance').where('studentId','==',old.studentId)),
   tx.get(db.collection('opsAudit').where('studentId','==',old.studentId)),
  ]);
  const account=accountSnap.data() as Account|undefined;
  if(account?.ledgerVersion===2)throw Error('회차 계산 전환이 완료된 수강권입니다. 수강권·회차 점검의 연결 정정에서 확인해주세요.');
  if(!account||account.updatedAt!==input.expectedAccountUpdatedAt||(old.updatedAt||'')!==input.expectedInvoiceUpdatedAt)throw Error('수강권 또는 출결이 변경됐습니다. 창을 닫고 다시 확인해주세요.');
  const payments=receipts.docs.map(d=>d.data() as Payment).filter(p=>!p.cancelledAt);
  if(!payments.length||payments.some(p=>{const conflict=historicalPaymentConflict(old,p);return !conflict||conflict.originalStart!==originalStart||conflict.currentStart!==currentStart;})||payments.reduce((sum,p)=>sum+p.amount,0)!==old.paid||old.paid!==old.amount)throw Error('수납 기록의 원래 시작일이 일치하지 않습니다. 자동 복구할 수 없습니다.');
  if(old.reservedPass||old.needsReview||old.allocatedUnits!==old.units||account.currentPassId!==old.passId||account.currentPassStart!==currentStart||account.planUnits!==old.units||account.planAmount!==old.amount||(account.openInvoiceId&&account.openInvoiceId!==old.id))throw Error('현재 수강권 상태가 달라 자동 복구할 수 없습니다. 수강권 이력을 확인해주세요.');
  if(all.docs.some(d=>d.id!==old.id&&d.data().status!=='cancelled'&&([originalStart,currentStart].includes(passDay(d.data() as Invoice))||d.data().passId===old.passId)))throw Error('같은 날짜나 수강권에 다른 청구가 있습니다. 중복 여부를 먼저 확인해주세요.');
  const allocations=audits.docs.map(d=>d.data()).filter(a=>a.action==='allocate-pass'&&a.detail?.passId===old.passId&&a.detail?.day===currentStart);
  if(allocations.length!==1||allocations[0].detail.units!==old.units||payments.some(p=>!p.at||p.at>allocations[0].at))throw Error('잘못 재사용된 수강권의 횟수 반영 근거를 확인할 수 없습니다.');
  const linked=lessons.docs.filter(d=>{const r=d.data() as Attendance;return r.passId===old.passId&&r.day>=currentStart;});
  if(!linked.some(d=>d.data().day===currentStart))throw Error('현재 수강권에 연결된 출결을 찾을 수 없습니다.');
  const stamp=new Date(Math.max(Date.now(),Date.parse(account.updatedAt)+1,Date.parse(old.updatedAt||old.createdAt)+1)).toISOString();
  const replacement={id:newId,studentId:old.studentId,name:old.name,units:old.units,amount:old.amount,paid:0,status:'open',needsReview:false,passId:newId,lessonDate:currentStart,creditUnits:0,allocationState:'allocated',allocatedUnits:old.units,allocationAt:old.allocationAt||allocations[0].at,createdAt:stamp,updatedAt:stamp,recoveredFromInvoiceId:old.id};
  tx.update(invoiceRef,{lessonDate:originalStart,...(old.cycleStart?{cycleStart:originalStart}:{}),linkReview:false,updatedAt:stamp});
  tx.create(newRef,replacement);
  for(const doc of linked)tx.update(doc.ref,{passId:newId,updatedAt:stamp});
  tx.update(accountRef,{currentPassId:newId,openInvoiceId:newId,updatedAt:stamp});
  tx.create(db.collection('opsAudit').doc(),{actor,action:'repair-historical-pass',studentId:old.studentId,at:stamp,detail:{invoiceId:old.id,newInvoiceId:newId,originalStart,currentStart,paymentIds:receipts.docs.filter(d=>!d.data().cancelledAt).map(d=>d.id),attendanceIds:linked.map(d=>d.id),remainingBefore:account.remaining,remainingAfter:account.remaining,creditedUnits:0,amount:old.amount}});
 });
}
