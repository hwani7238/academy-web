import { database, hash } from './auth';
import { buildCourseLedger, type LedgerEvidence } from './course-ledger';
import { integrityLegacy, type IntegritySource } from './integrity-service';
import { seoulDay, type Account, type Attendance, type Invoice, type Payment } from './model';
import type { LessonReference } from './lesson-reference';
import type { LegacyCorrection } from './legacy-correction';
import type { Transaction } from 'firebase-admin/firestore';

export function ledgerFingerprint(e:LedgerEvidence) {
 const ordered=<T,>(rows:T[])=>[...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return hash(JSON.stringify({account:e.account,attendance:ordered(e.attendance),invoices:ordered(e.invoices),payments:ordered(e.payments),references:ordered(e.references),legacy:ordered(e.legacy),...(e.sheet?{sheet:e.sheet}:{})}));
}
export async function readCourseLedgerEvidence(studentId:string,tx?:Transaction,newAccount?:Account):Promise<LedgerEvidence> {
 const db=database(),get=(ref:FirebaseFirestore.DocumentReference|FirebaseFirestore.Query):Promise<any>=>tx?tx.get(ref as FirebaseFirestore.DocumentReference):ref.get();
 const accountDoc=await get(db.doc(`opsAccounts/${studentId}`));if(!accountDoc.exists&&!newAccount)throw Error('수강 정보를 찾을 수 없습니다.');
 const account={...(accountDoc.exists?accountDoc.data():newAccount),id:studentId} as Account;
 const [attendance,invoices,payments,references,corrections,source,sheet]=await Promise.all([
  get(db.collection('opsAttendance').where('studentId','==',studentId)),get(db.collection('opsInvoices').where('studentId','==',studentId)),get(db.collection('opsPayments').where('studentId','==',studentId)),get(db.collection('opsLessonReferences')),get(db.collection('opsLegacyCorrections').where('studentId','==',studentId)),account.importId?get(db.doc(`opsImports/${account.importId}`)):Promise.resolve(null),get(db.doc(`opsLedgerSources/${studentId}`)),
 ]);
 const rows=<T,>(snap:FirebaseFirestore.QuerySnapshot)=>snap.docs.map(d=>({...d.data(),id:d.id}) as T);
 return {account,...(sheet?.exists?{sheet:sheet.data()}:{}),attendance:rows<Attendance>(attendance),invoices:rows<Invoice>(invoices),payments:rows<Payment>(payments),references:(references.docs.flatMap((d:FirebaseFirestore.QueryDocumentSnapshot)=>d.data().references||[]) as LessonReference[]).filter(r=>r.studentId===studentId),legacy:integrityLegacy(account,source?.exists?[{...source.data(),id:source.id} as IntegritySource]:[],rows<LegacyCorrection>(corrections))};
}
export async function courseLedgerReports(includeEvidence=false){
 const db=database(),today=seoulDay();
 const [aa,rr,ii,pp,refs,imports,cc,ss]=await Promise.all(['opsAccounts','opsAttendance','opsInvoices','opsPayments','opsLessonReferences','opsImports','opsLegacyCorrections','opsLedgerSources'].map(c=>db.collection(c).get()));
 const rows=<T,>(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({...d.data(),id:d.id}) as T);
 const records=rows<Attendance>(rr),invoices=rows<Invoice>(ii),payments=rows<Payment>(pp),references=refs.docs.flatMap(d=>d.data().references||[]) as LessonReference[],sources=rows<IntegritySource>(imports),corrections=rows<LegacyCorrection>(cc);
 return rows<Account>(aa).filter(a=>a.active).map(account=>{
  const sheet=ss.docs.find(d=>d.id===account.id)?.data() as LedgerEvidence['sheet'];
  const e:LedgerEvidence={account,...(sheet?{sheet}:{}),attendance:records.filter(r=>r.studentId===account.id),invoices:invoices.filter(r=>r.studentId===account.id),payments:payments.filter(r=>r.studentId===account.id),references:references.filter(r=>r.studentId===account.id),legacy:integrityLegacy(account,sources,corrections)};
  const {phone,checkinSuffixes,...safeAccount}=account;
  return {...buildCourseLedger(e,today),fingerprint:ledgerFingerprint(e),...(includeEvidence?{evidence:{...e,account:safeAccount}}:{})};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}

/** Preserve every attendance fact and receipt. Only the derived pass linkage is
 * repaired; the complete before/after evidence is stored atomically for audit. */
export async function reconcileCourseLedger(input:Record<string,unknown>,actor:string){
 const studentId=String(input.studentId||''),fingerprint=String(input.fingerprint||'');
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(studentId)||!fingerprint)throw Error('점검 결과를 먼저 확인해주세요.');
 const db=database(),auditRef=db.doc(`opsAudit/ledger_${hash(studentId+fingerprint)}`);
 return db.runTransaction(async tx=>{
  const previous=await tx.get(auditRef);if(previous.exists)return {ok:true,duplicate:true};
  const e=await readCourseLedgerEvidence(studentId,tx);
  if(e.account.ledgerVersion===2)throw Error('회차 계산 전환이 완료된 수강권입니다. 연결 정정에서 확인해주세요.');
  if(ledgerFingerprint(e)!==fingerprint)throw Error('점검 후 출결 또는 수납이 변경됐습니다. 다시 점검해주세요.');
  const ledger=buildCourseLedger(e,seoulDay()),plan=ledger.repair;
  if(!plan)throw Error('근거가 불명확해 자동 정정할 수 없습니다. 기존 기록은 유지합니다.');
  const invoiceId=`ledger_${hash(JSON.stringify([studentId,plan.start]))}`;
  if(e.invoices.some(i=>i.id===invoiceId||i.status!=='cancelled'&&(i.lessonDate||i.cycleStart)===plan.start))throw Error('이미 연결된 수강권이 있습니다. 다시 점검해주세요.');
  const stamp=new Date(Math.max(Date.now(),Date.parse(e.account.updatedAt||'')+1||0)).toISOString();
  const invoice:Invoice={id:invoiceId,studentId,name:e.account.name,units:plan.units,amount:plan.amount,paid:0,status:'open',needsReview:false,linkReview:false,passId:invoiceId,lessonDate:plan.start,cycleStart:plan.start,creditUnits:0,allocationState:'allocated',allocatedUnits:plan.units,allocationAt:stamp,createdAt:stamp,updatedAt:stamp};
  const account={...e.account,currentPassId:invoiceId,currentPassStart:plan.start,openInvoiceId:invoiceId,updatedAt:stamp};
  const corrected=e.attendance.map(r=>plan.attendanceIds.includes(r.id)?{...r,passId:invoiceId,updatedAt:stamp}:r);
  const nextEvidence={...e,account,attendance:corrected,invoices:[...e.invoices,invoice]};
  const after=buildCourseLedger(nextEvidence,seoulDay());
  const current=after.passes.find(p=>p.id===invoiceId);
  if(!current||current.paymentStatus!=='unpaid'||after.repair||account.remaining!==e.account.remaining)throw Error('정정 결과 검증에 실패했습니다. 저장하지 않았습니다.');
  tx.create(db.doc(`opsInvoices/${invoiceId}`),invoice);
  for(const r of corrected.filter(r=>plan.attendanceIds.includes(r.id)))tx.update(db.doc(`opsAttendance/${r.id}`),{passId:r.passId,updatedAt:stamp});
  tx.update(db.doc(`opsAccounts/${studentId}`),account);
  tx.set(db.doc(`opsCourseLedgers/${studentId}`),{...after,fingerprint:ledgerFingerprint(nextEvidence),updatedAt:stamp});
  tx.create(auditRef,{actor,action:'reconcile-course-ledger',studentId,at:stamp,detail:{reason:'회차 원장 기준 누락 수강권 분리',source:'ledger-review',fingerprint,before:{account:e.account,attendance:e.attendance.filter(r=>plan.attendanceIds.includes(r.id)),invoices:e.invoices},after:{account,attendance:corrected.filter(r=>plan.attendanceIds.includes(r.id)),invoice},receiptsPreserved:e.payments.map(p=>p.id),paymentUnchanged:true,attendanceFactsUnchanged:true,creditedUnits:0,remainingBefore:e.account.remaining,remainingAfter:account.remaining}});
  return {ok:true,invoiceId,start:plan.start,remaining:account.remaining};
 });
}
