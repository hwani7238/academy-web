import {database,manager,failure} from '@/lib/operations/auth';
import {reviewBalance,type BalanceAudit,type BalanceSource} from '@/lib/operations/balance-review';
import {seoulDay,type Account,type Attendance,type Invoice} from '@/lib/operations/model';
import {projectLessonLedger} from '@/lib/operations/lesson-ledger';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 try{
  await manager(request);const db=database();
  const [accounts,sources,audits,attendance,invoices,ledgers]=await Promise.all(['opsAccounts','opsImports','opsAudit','opsAttendance','opsInvoices','opsCourseLedgers'].map(c=>db.collection(c).get()));
  const read=<T,>(rows:FirebaseFirestore.QuerySnapshot)=>rows.docs.map(d=>({...d.data(),id:d.id}) as T);
  const sourceRows=read<BalanceSource>(sources),auditRows=read<BalanceAudit>(audits),records=read<Attendance>(attendance),bills=read<Invoice>(invoices);
  const originalRefs=[...new Set(read<Account>(accounts).map(a=>a.importId).filter((v):v is string=>!!v))].map(id=>db.doc(`opsImports/${id}/revisions/1`));
  const originals=originalRefs.length?await db.getAll(...originalRefs):[];
  for(let n=0;n<originals.length;n++){const source=sourceRows.find(s=>originalRefs[n].path===`opsImports/${s.id}/revisions/1`);if(source && originals[n].exists)source.openingHistory=originals[n].data()?.history;}
  const rows=read<Account>(accounts).map(a=>{const row=reviewBalance(a,sourceRows.find(s=>s.id===a.importId),auditRows,records,bills);const stored=ledgers.docs.find(d=>d.id===a.id)?.data();if(a.ledgerVersion!==2||stored?.version!==2)return row;const p=projectLessonLedger(a,stored.seed,records,bills,seoulDay());return {...row,current:p.currentRemaining,expected:p.currentRemaining,ledger:p.currentRemaining,status:p.issues.length?'review':'verified',reason:p.issues.length?p.issues.join(' / '):`수강권 회차 원장 기준 · 정규 잔여 ${p.currentRemaining}회 · 미완료 보강 ${p.currentMakeups+p.previousMakeups}회`,missingDays:[]};}).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return Response.json({at:new Date().toISOString(),rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
