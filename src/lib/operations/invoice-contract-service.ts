import {database,hash} from './auth';
import {auditInvoiceContracts,type ContractFinding} from './invoice-contract';
import type {Account,Attendance,Invoice,Payment} from './model';
import type {LessonLedgerSeed} from './lesson-ledger';
type Evidence={account:Account;invoices:Invoice[];attendance:Attendance[];payments:Payment[];seed?:LessonLedgerSeed;notices:Record<string,unknown>[]};
const fingerprint=(e:Evidence)=>hash(JSON.stringify({...e,invoices:[...e.invoices].sort((a,b)=>a.id.localeCompare(b.id)),attendance:[...e.attendance].sort((a,b)=>a.id.localeCompare(b.id)),payments:[...e.payments].sort((a,b)=>a.id.localeCompare(b.id)),notices:[...e.notices].sort((a,b)=>String(a.id).localeCompare(String(b.id)))}));
function report(e:Evidence){
 const findings=auditInvoiceContracts(e.account,e.invoices,e.attendance,e.payments,e.seed).map((f):ContractFinding=>{
  const notice=e.notices.find(n=>n.id===`billing_${f.invoiceId}`);
  if(f.fix&&notice&&!['queued','blocked','review','cancelled','failed'].includes(String(notice.status))){const {fix,...rest}=f;return {...rest,reason:f.reason+' · 이미 발송된 결제 안내 확인 필요'};}
  return f;
 });
 return {studentId:e.account.id,name:e.account.name,active:e.account.active,planUnits:e.account.planUnits,planAmount:e.account.planAmount,invoiceCount:e.invoices.length,attendanceCount:e.attendance.length,paymentCount:e.payments.length,remaining:e.account.remaining,fingerprint:fingerprint(e),findings};
}
export async function invoiceContractReports(){
 const db=database(),[aa,ii,rr,pp,ll,nn]=await Promise.all(['opsAccounts','opsInvoices','opsAttendance','opsPayments','opsCourseLedgers','opsNotices'].map(c=>db.collection(c).get()));
 const rows=<T,>(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({...d.data(),id:d.id}) as T);
 const invoices=rows<Invoice>(ii),attendance=rows<Attendance>(rr),payments=rows<Payment>(pp),notices=rows<Record<string,unknown>>(nn);
 const reports=rows<Account>(aa).map(account=>report({account,invoices:invoices.filter(i=>i.studentId===account.id),attendance:attendance.filter(r=>r.studentId===account.id),payments:payments.filter(p=>p.studentId===account.id),seed:ll.docs.find(d=>d.id===account.id)?.data()?.seed,notices:notices.filter(n=>n.studentId===account.id)}));
 const orphans=[...new Set([...invoices,...payments].map(v=>v.studentId))].filter(id=>!reports.some(r=>r.studentId===id));
 for(const id of orphans){const ii=invoices.filter(i=>i.studentId===id),pp=payments.filter(p=>p.studentId===id);reports.push({studentId:id,name:ii[0]?.name||'수강 설정 없는 기록',active:false,planUnits:0,planAmount:0,invoiceCount:ii.length,attendanceCount:0,paymentCount:pp.length,remaining:0,fingerprint:'',findings:[{invoiceId:ii[0]?.id||'',kind:'missing-account',reason:'청구·수납에 연결된 수강 설정이 없습니다. 원본을 보존하고 확인해야 합니다.'}]});}
 return reports.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}
/** Explicit, preview-bound repair. Never replays attendance or writes receipts,
 * balances or ledger seeds. Before/after invoice copies remain in the audit. */
export async function reconcileInvoiceContracts(input:Record<string,unknown>,actor:string){
 const studentId=String(input.studentId||''),expected=String(input.fingerprint||'');
 if(!/^[\w-]{1,160}$/.test(studentId)||!expected)throw Error('전체 점검 결과를 먼저 확인해주세요.');
 const db=database();return db.runTransaction(async tx=>{
  const auditRef=db.doc(`opsAudit/contracts_${hash(studentId+expected)}`),prior=await tx.get(auditRef);if(prior.exists)return {ok:true,duplicate:true,studentId};
  const [a,ii,rr,pp,l,nn]=await Promise.all([tx.get(db.doc('opsAccounts/'+studentId)),tx.get(db.collection('opsInvoices').where('studentId','==',studentId)),tx.get(db.collection('opsAttendance').where('studentId','==',studentId)),tx.get(db.collection('opsPayments').where('studentId','==',studentId)),tx.get(db.doc('opsCourseLedgers/'+studentId)),tx.get(db.collection('opsNotices').where('studentId','==',studentId))]);
  if(!a.exists)throw Error('수강 설정을 찾을 수 없습니다.');
  const rows=<T,>(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({...d.data(),id:d.id}) as T);
  const e:Evidence={account:{...a.data(),id:studentId} as Account,invoices:rows<Invoice>(ii),attendance:rows<Attendance>(rr),payments:rows<Payment>(pp),seed:l.data()?.seed,notices:rows<Record<string,unknown>>(nn)};
  if(fingerprint(e)!==expected)throw Error('점검 후 자료가 변경됐습니다. 다시 점검해주세요.');
  const fixes=report(e).findings.filter(f=>f.fix);if(!fixes.length)throw Error('자동으로 정정할 근거가 충분한 미사용 청구가 없습니다.');
  const stamp=new Date().toISOString(),changes=fixes.map(f=>{const before=e.invoices.find(i=>i.id===f.invoiceId)!;return {before,after:{...before,...f.fix,updatedAt:stamp,contractCorrectedAt:stamp}};});
  for(const {after} of changes){tx.update(db.doc('opsInvoices/'+after.id),after);const notice=e.notices.find(n=>n.id===`billing_${after.id}`);if(notice&&notice.status!=='cancelled')tx.update(db.doc('opsNotices/'+notice.id),{parameters:{...(notice.parameters as object),amount:String(after.amount),lesson_count:String(after.units)}});}
  tx.create(auditRef,{actor,studentId,action:'reconcile-invoice-contracts',at:stamp,detail:{changes,remaining:e.account.remaining,attendancePreserved:e.attendance.map(r=>r.id),paymentsPreserved:e.payments.map(p=>p.id),fingerprint:expected}});
  return {ok:true,studentId,corrected:changes.length};
 });
}
