import {database,manager,failure} from '@/lib/operations/auth';
import {reviewBalance,type BalanceAudit,type BalanceSource} from '@/lib/operations/balance-review';
import type {Account,Attendance,Invoice} from '@/lib/operations/model';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 try{
  await manager(request);const db=database();
  const [accounts,sources,audits,attendance,invoices]=await Promise.all(['opsAccounts','opsImports','opsAudit','opsAttendance','opsInvoices'].map(c=>db.collection(c).get()));
  const read=<T,>(rows:FirebaseFirestore.QuerySnapshot)=>rows.docs.map(d=>({...d.data(),id:d.id}) as T);
  const sourceRows=read<BalanceSource>(sources),auditRows=read<BalanceAudit>(audits),records=read<Attendance>(attendance),bills=read<Invoice>(invoices);
  const originalRefs=[...new Set(read<Account>(accounts).map(a=>a.importId).filter((v):v is string=>!!v))].map(id=>db.doc(`opsImports/${id}/revisions/1`));
  const originals=originalRefs.length?await db.getAll(...originalRefs):[];
  for(let n=0;n<originals.length;n++){const source=sourceRows.find(s=>originalRefs[n].path===`opsImports/${s.id}/revisions/1`);if(source && originals[n].exists)source.openingHistory=originals[n].data()?.history;}
  const rows=read<Account>(accounts).map(a=>reviewBalance(a,sourceRows.find(s=>s.id===a.importId),auditRows,records,bills)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return Response.json({at:new Date().toISOString(),rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
