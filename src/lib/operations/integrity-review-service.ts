import {database,hash} from './auth';
import {readCourseLedgerEvidence} from './course-ledger-service';
import {integrityLegacy,type IntegritySource} from './integrity-service';
import {reviewAccount,monthlyReview,reviewDay,closedAttendanceDay,lastDayOfMonth,previousDay,type ReviewEntry,type ReviewContext} from './integrity-review';
import type {LedgerEvidence} from './course-ledger';
import type {Account,Attendance,Invoice,Payment} from './model';
import type {LegacyCorrection} from './legacy-correction';
import type {LessonReference} from './lesson-reference';

type Stored={entries?:Record<string,ReviewEntry>;lastFullAt?:string;lastFullDay?:string;lastScopedAt?:string;error?:string;errorAt?:string;dirtyMonths?:string[];monthly?:ReturnType<typeof monthlyReview>;notification?:{key:string;at:string;count:number};};
const statePath='opsIntegrityStatus/latest';
function summary(state:Stored){const entries=Object.values(state.entries||{}),issues=entries.flatMap(e=>e.issues);return {checked:entries.filter(e=>e.checked).length,issues,checkedAt:[state.lastFullAt||'',state.lastScopedAt||''].sort().at(-1)||'',lastFullAt:state.lastFullAt||'',lastFullDay:state.lastFullDay||'',lastScopedAt:state.lastScopedAt||'',error:state.error||'',errorAt:state.errorAt||'',monthly:state.monthly||null,monthlyStale:!!state.monthly&&!!state.dirtyMonths?.includes(state.monthly.month),notification:state.notification||null,scheduledConfigured:!!process.env.CRON_SECRET,scheduledTime:'23:30',timezone:'Asia/Seoul'};}
export async function getIntegrityStatus(){return summary((await database().doc(statePath).get()).data()||{});}
async function readBatch(ids?:string[]){
 const db=database();
 if(ids){const out=await Promise.all(ids.map(async id=>{const a=await db.doc('opsAccounts/'+id).get();if(!a.exists)return null;const e=await readCourseLedgerEvidence(id);const [owner,ledger]=await Promise.all([db.doc('students/'+(e.account.sourceStudentId||id)).get(),db.doc('opsCourseLedgers/'+id).get()]);return {e,ctx:{owner:owner.data(),seed:ledger.data()?.seed} as ReviewContext};}));return {items:out.filter((v):v is NonNullable<typeof v>=>!!v),payments:[] as Payment[]};}
 const [aa,rr,ii,pp,refs,imports,cc,ss,ll,students]=await Promise.all(['opsAccounts','opsAttendance','opsInvoices','opsPayments','opsLessonReferences','opsImports','opsLegacyCorrections','opsLedgerSources','opsCourseLedgers','students'].map(c=>db.collection(c).get()));
 const rows=<T,>(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({...d.data(),id:d.id}) as T);
 const records=rows<Attendance>(rr),invoices=rows<Invoice>(ii),payments=rows<Payment>(pp),references=refs.docs.flatMap(d=>d.data().references||[]) as LessonReference[],sources=rows<IntegritySource>(imports),corrections=rows<LegacyCorrection>(cc);
 return {payments,items:rows<Account>(aa).map(account=>({e:{account,attendance:records.filter(r=>r.studentId===account.id),invoices:invoices.filter(r=>r.studentId===account.id),payments:payments.filter(r=>r.studentId===account.id),references:references.filter(r=>r.studentId===account.id),legacy:integrityLegacy(account,sources,corrections),...(ss.docs.some(d=>d.id===account.id)?{sheet:ss.docs.find(d=>d.id===account.id)!.data() as LedgerEvidence['sheet']}:{})},ctx:{owner:students.docs.find(d=>d.id===(account.sourceStudentId||account.id))?.data(),seed:ll.docs.find(d=>d.id===account.id)?.data().seed} as ReviewContext}))};
}
export async function runIntegrityReview(actor:string,options:{ids?:string[];scheduled?:boolean;now?:Date;changedMonths?:string[]}={}){
 const db=database(),now=options.now||new Date(),startedAt=now.toISOString(),day=options.scheduled?reviewDay(now):closedAttendanceDay(now),full=!options.ids;
 const ids=options.ids?[...new Set(options.ids)].filter(id=>/^[A-Za-z0-9_-]{1,160}$/.test(id)):undefined;
 if(ids&&!ids.length)return getIntegrityStatus();
 const lockRef=db.doc('opsIntegrityRuns/'+(full?'full':hash(ids!.slice().sort().join('|')))),token=hash(startedAt+actor+Math.random());
 const acquired=await db.runTransaction(async tx=>{const old=(await tx.get(lockRef)).data();if(old?.leaseUntil>Date.now()||options.scheduled&&old?.completedDay===day)return false;tx.set(lockRef,{...old,token,startedAt,leaseUntil:Date.now()+180000});return true;});
 if(!acquired)return {...await getIntegrityStatus(),busy:true};
 try{
  const previous=((await db.doc(statePath).get()).data()||{}) as Stored,source=await readBatch(ids),batch=source.items;
  const results=batch.map(({e,ctx})=>{const older=(previous.entries?.[e.account.id]?.issues||[]).filter(i=>i.kind==='attendance-missing').map(i=>i.day);return reviewAccount(e,ctx,options.scheduled?day:reviewDay(now),[day,...older],startedAt);});
  // Month-end includes every receipt, including withdrawn/inactive accounts.
  const months=new Set(full?(previous.dirtyMonths||[]).filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&lastDayOfMonth(m)<=day):[]);
  if(full&&day===lastDayOfMonth(day.slice(0,7)))months.add(day.slice(0,7));
  if(full&&day.endsWith('-01'))months.add(previousDay(day).slice(0,7));
  const monthly=[...months].sort().map(month=>{const report=monthlyReview(batch.map(b=>b.e),month,startedAt,source.payments);const days=Array.from({length:Number(lastDayOfMonth(month).slice(-2))},(_,n)=>month+'-'+String(n+1).padStart(2,'0'));for(const {e,ctx} of batch)report.issues.push(...reviewAccount(e,ctx,day,days,startedAt).issues.filter(i=>i.kind==='attendance-missing'));return report;});
  await db.runTransaction(async tx=>{
   const ref=db.doc(statePath),state=((await tx.get(ref)).data()||{}) as Stored,lock=(await tx.get(lockRef)).data();
   if(lock?.token!==token)throw Error('점검이 다른 요청으로 갱신됐습니다. 다시 확인해주세요.');
   const entries={...state.entries};
   if(full)for(const id of Object.keys(entries))if(!batch.some(b=>b.e.account.id===id)&&entries[id].checkedAt<=startedAt)delete entries[id];
   for(const r of results)if(!entries[r.studentId]||entries[r.studentId].checkedAt<=startedAt)entries[r.studentId]=r;
   const issues=Object.values(entries).flatMap(r=>r.issues),signature=hash(JSON.stringify(issues.map(i=>[i.studentId,i.kind,i.day,i.reason]).sort()));
   const changed=signature!==state.notification?.key;
   const dirty=new Set(state.dirtyMonths||[]);for(const m of monthly)if(!state.lastScopedAt||state.lastScopedAt<=startedAt)dirty.delete(m.month);for(const m of options.changedMonths||[])if(/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&lastDayOfMonth(m)<=day)dirty.add(m);
   const next:Stored={...state,entries,...(full?{lastFullAt:startedAt,lastFullDay:day,error:'',errorAt:''}:{lastScopedAt:startedAt}),dirtyMonths:[...dirty].sort(),...(monthly.length?{monthly:monthly.at(-1)}:{}),...(changed?{notification:{key:signature,at:startedAt,count:issues.length}}:{})};
   tx.set(ref,JSON.parse(JSON.stringify(next)));
   for(const m of monthly)tx.set(db.doc('opsIntegrityMonths/'+m.month),m);
   tx.set(lockRef,{token,startedAt,leaseUntil:0,...(options.scheduled?{completedDay:day}:lock?.completedDay?{completedDay:lock.completedDay}:{})});
   if(full)tx.set(db.doc('opsIntegrityRuns/report_'+hash(token)),{actor,checkedAt:startedAt,day,scheduled:!!options.scheduled,checked:results.filter(r=>r.checked).length,issueCount:issues.length,months:monthly.map(m=>m.month)});
  });
  return getIntegrityStatus();
 }catch(error){
  await db.runTransaction(async tx=>{const ref=db.doc(statePath),state=(await tx.get(ref)).data()||{},lock=(await tx.get(lockRef)).data();if(lock?.token===token){tx.set(lockRef,{...lock,leaseUntil:0});tx.set(ref,{...state,error:error instanceof Error?error.message:'점검 실패',errorAt:new Date().toISOString()});}});
  throw error;
 }
}
const ignored=new Set(['pair','revoke','releaseBlocked','process','sendInvoice']);
export async function reviewChangedOperation(input:Record<string,any>,result:Record<string,any>,actor:string){
 if(ignored.has(String(input.action)))return;
 const db=database(),ids=new Set<string>(),months=new Set<string>();
 const add=(id:unknown)=>{if(typeof id==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(id))ids.add(id);};
 add(input.studentId);add(result.studentId);for(const row of Array.isArray(input.rows)?input.rows:[])add(row.studentId);for(const row of Array.isArray(result.matched)?result.matched:[])add(row.studentId);
 for(const row of result.changes?.accounts||[])add(row.id);
 for(const field of ['invoiceId','paymentId'])if(typeof input[field]==='string'){const d=(await db.doc((field==='invoiceId'?'opsInvoices/':'opsPayments/')+input[field]).get()).data();add(d?.studentId);for(const value of [d?.lessonDate,d?.cycleStart,d?.paymentDate])if(typeof value==='string')months.add(value.slice(0,7));}
 if(typeof input.sourceStudentId==='string')for(const d of (await db.collection('opsAccounts').where('sourceStudentId','==',input.sourceStudentId).get()).docs)add(d.id);
 for(const key of ['day','start','end','lessonDate','paymentDate','month'])if(typeof input[key]==='string'&&/^\d{4}-\d{2}/.test(input[key]))months.add(input[key].slice(0,7));
 if(!ids.size)return; // Never fall back to an academy-wide scan for a missing ID.
 await runIntegrityReview(actor,{ids:[...ids],changedMonths:[...months]});
}
