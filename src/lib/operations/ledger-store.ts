import {database as rawDatabase,hash} from './auth';
import {requireUnusedInvoice} from './invoice-contract';
import {readCourseLedgerEvidence} from './course-ledger-service';
import {projectLessonLedger,type LessonLedgerSeed} from './lesson-ledger';
import {seoulDay,type Account,type Attendance,type Invoice,type Payment} from './model';
import type {Firestore,Transaction,DocumentReference} from 'firebase-admin/firestore';

type Write={kind:'create'|'set'|'update'|'delete';ref:DocumentReference;data?:Record<string,unknown>;options?:unknown};
const sourceCollections=new Set(['opsAccounts','opsAttendance','opsInvoices','opsPayments','opsLegacyCorrections']);
/** Buffer domain writes until every required read and projection has completed.
 * The source operation, pass allocation, balance, and audit commit atomically. */
export function ledgerDatabase():Firestore{
 const db=rawDatabase();
 return new Proxy(db,{get(target,key){
  if(key!=='runTransaction'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  return async <T,>(operation:(tx:Transaction)=>Promise<T>)=>db.runTransaction(async real=>{
   const writes:Write[]=[];
   let buffered:Transaction;
   buffered=new Proxy(real,{get(tx,name){
    if(['create','set','update','delete'].includes(String(name)))return (ref:DocumentReference,data?:Record<string,unknown>,options?:unknown)=>{writes.push({kind:name as Write['kind'],ref,data,options});return buffered;};
    const value=Reflect.get(tx,name);return typeof value==='function'?value.bind(tx):value;
   }});
   const result=await operation(buffered),ids=new Set<string>();
   for(const w of writes){const [collection,id]=w.ref.path.split('/');if(collection==='opsAccounts')ids.add(id);else if(sourceCollections.has(collection)&&typeof w.data?.studentId==='string')ids.add(w.data.studentId);else if(collection==='opsAudit'&&typeof w.data?.studentId==='string')ids.add(w.data.studentId);}
   const mergedAccounts:Account[]=[],mergedAttendance:Attendance[]=[],mergedInvoices:Invoice[]=[];
   for(const id of ids){
    const persisted=(await real.get(db.doc(`opsCourseLedgers/${id}`))).data();
    const stored=writes.find(w=>w.ref.path===`opsCourseLedgers/${id}`&&w.data?.version===2)?.data||persisted;
    if(stored?.version!==2||!stored.seed)continue;
    const e=await readCourseLedgerEvidence(id,real,writes.find(w=>w.ref.path===`opsAccounts/${id}`&&w.kind==='create')?.data as Account|undefined),seed=structuredClone(stored.seed) as LessonLedgerSeed;
    const overlay=<T extends {id:string}>(collection:string,original:T[])=>{
     const map=new Map(original.map(row=>[row.id,{...row}]));
     for(const w of writes.filter(w=>w.ref.path.startsWith(collection+'/'))){const key=w.ref.id;if(w.kind==='delete')map.delete(key);else map.set(key,{...(w.kind==='update'||w.options?(map.get(key)||{}):{}),...w.data,id:key} as T);}
     return [...map.values()];
    };
    const account=overlay<Account>('opsAccounts',[e.account]).find(a=>a.id===id)!;
    const attendance=overlay<Attendance>('opsAttendance',e.attendance).filter(r=>r.studentId===id),invoices=overlay<Invoice>('opsInvoices',e.invoices).filter(i=>i.studentId===id);
    const payments=overlay<Payment>('opsPayments',e.payments).filter(p=>p.studentId===id);
    for(const old of e.invoices){const next=invoices.find(i=>i.id===old.id);if(next&&(next.units!==old.units||next.amount!==old.amount))requireUnusedInvoice(old,e.attendance,e.payments,seed);}
    const legacyChanges=writes.filter(w=>w.ref.path.startsWith('opsLegacyCorrections/')&&w.data?.studentId===id);
    for(const w of legacyChanges){const r=seed.history?.find(r=>r.day===w.data?.day);if(r){const status=w.data!.status as Attendance['status'];Object.assign(r,{status,units:status==='present'?1:0,note:String(w.data!.note||''),updatedAt:String(w.data!.updatedAt||'')});}}
    const changed=attendance.filter(row=>{const old=e.attendance.find(r=>r.id===row.id);return !old||old.units!==row.units||old.status!==row.status||old.relatedDay!==row.relatedDay;});
    if(seed.deferredDays)seed.deferredDays=seed.deferredDays.filter(day=>!changed.some(r=>r.day===day));
    const isRegular=(r?:Attendance)=>!!r&&!['makeup','makeup_reserved','paused','cancelled'].includes(r.status||'present');
    const reflowFrom=[...changed.filter(r=>isRegular(r)||isRegular(e.attendance.find(x=>x.id===r.id))).map(r=>r.day),...legacyChanges.map(w=>String(w.data!.day))].sort()[0];
    if(reflowFrom&&reflowFrom<seed.from)throw Error('이관 시작일 이전의 정규 출결입니다. 해당 수강권의 시작 회차를 먼저 확인해주세요. 변경은 저장하지 않았습니다.');
    const stamp=new Date(Math.max(Date.now(),(Date.parse(e.account.updatedAt)||0)+1)).toISOString(),today=seoulDay();
    let projection=projectLessonLedger(account,seed,attendance,invoices,today,reflowFrom);
    const correction=writes.find(w=>w.ref.path.startsWith('opsAudit/')&&w.data?.studentId===id&&w.data?.action==='correct-remaining');
    if(correction){
     const detail=correction.data!.detail as Record<string,unknown>,target=Number(detail.after);
     if(!Number.isSafeInteger(target))throw Error('정정할 잔여 횟수를 확인해주세요.');
     seed.adjustments.push({id:correction.ref.id,passId:projection.currentPassId,units:target-projection.currentRemaining,reason:String(detail.note||detail.reason||'원장 잔여 정정'),at:stamp});
     projection=projectLessonLedger(account,seed,attendance,invoices,today,reflowFrom);
    }
    if(projection.issues.length)throw Error(projection.issues.slice(0,3).join(' / '));
    const beforeProjection=projectLessonLedger(e.account,seed,e.attendance,e.invoices,today);
    const activePasses=projection.passes.filter(p=>p.actual&&p.start<=today);
    for(const p of activePasses){
     let invoice=invoices.find(i=>i.id===p.invoiceId);
     if(!invoice){
      if(p.id.startsWith('opening_'))continue; // Audited opening rights do not invent a receipt.
      if(invoices.some(i=>i.status!=='cancelled'&&i.paid>0&&(!(i.lessonDate||i.cycleStart)||i.linkReview)))throw Error('이전 수납의 연결을 확인해야 새 수강권 청구를 확정할 수 있습니다.');
      const invoiceId=`slot_${hash(JSON.stringify([id,p.id]))}`;
      invoice={id:invoiceId,studentId:id,name:account.name,passId:p.id,lessonDate:p.start,cycleStart:p.start,units:p.units,amount:p.amount,paid:0,status:'open',needsReview:false,linkReview:false,creditUnits:0,allocationState:'allocated',allocatedUnits:p.units,allocationAt:stamp,createdAt:stamp,updatedAt:stamp};
      invoices.push(invoice);p.invoiceId=invoiceId;writes.push({kind:'create',ref:db.doc(`opsInvoices/${invoiceId}`),data:{...invoice}});
     }else{
      const update={...invoice,lessonDate:p.start,cycleStart:p.start,passId:p.id,creditUnits:0,allocationState:'allocated' as const,allocatedUnits:p.units,reservedPass:false,updatedAt:stamp};
      if(invoice.lessonDate!==p.start||invoice.cycleStart!==p.start||invoice.allocationState!=='allocated'||invoice.passId!==p.id){writes.push({kind:'update',ref:db.doc(`opsInvoices/${invoice.id}`),data:update});Object.assign(invoice,update);}
     }
     mergedInvoices.push(invoice);
    }
    for(const p of projection.passes.filter(p=>!p.actual&&p.invoiceId)){
     const invoice=invoices.find(i=>i.id===p.invoiceId);
     if(invoice?.allocationState==='allocated'&&beforeProjection.passes.some(old=>old.id===p.id&&old.actual)){
      const update={allocationState:'pending',allocatedUnits:0,creditUnits:0,cycleStart:'',lessonDate:invoice.renewalReservation?.mode==='date'?invoice.renewalReservation.start:'',updatedAt:stamp};
      writes.push({kind:'update',ref:db.doc(`opsInvoices/${invoice.id}`),data:update});Object.assign(invoice,update);
     }
    }
    for(const row of attendance){
     const bindings=projection.assignments[row.id];if(!bindings?.length)continue;
     const allocation=bindings.map(b=>{const p=projection.passes.find(p=>p.id===b.passId);return {passId:b.passId,units:1,firstOrdinal:b.ordinal,passUnits:p?.units||0};});
     const patch={passId:bindings[0].passId,passAllocations:bindings.length>1?allocation:[]};
     if(row.passId!==patch.passId||JSON.stringify(row.passAllocations||[])!==JSON.stringify(patch.passAllocations))writes.push({kind:'update',ref:db.doc(`opsAttendance/${row.id}`),data:{...patch,updatedAt:stamp}});
     mergedAttendance.push({...row,...patch});
    }
    const current=projection.passes.find(p=>p.id===projection.currentPassId)!;
    const open=invoices.filter(i=>i.status==='open'&&i.paid<i.amount).sort((a,b)=>(a.lessonDate||'9999').localeCompare(b.lessonDate||'9999'))[0];
    const revision=hash(JSON.stringify([projection,seed.adjustments,attendance,invoices,payments]));
    const updated:Account={...account,ledgerVersion:2,ledgerRevision:revision,currentPassId:current.id,currentPassStart:current.start,remaining:projection.currentRemaining,upcomingPasses:projection.passes.filter(p=>p.invoiceId&&p.start>today).map(p=>({start:p.start,remaining:p.remaining})),previousMakeups:projection.previousMakeups,currentMakeups:projection.currentMakeups,planUnits:current.units,planAmount:current.amount,openInvoiceId:open?.id||null,updatedAt:stamp,...(account.nextPass&&activePasses.some(p=>p.invoiceId===account.nextPass!.invoiceId)?{nextPass:null}:{})};
    seed.passes=projection.passes.filter(p=>p.actual||!!p.invoiceId).map(({id,invoiceId,start,units,amount,openingUsed,openingOrdinal,fixedStart})=>({id,invoiceId,start,units,amount,...(openingUsed?{openingUsed}:{}),...(openingOrdinal?{openingOrdinal}:{}),...(fixedStart?{fixedStart}:{})}));
    writes.push({kind:'update',ref:db.doc(`opsAccounts/${id}`),data:{...updated}});
    writes.push({kind:'set',ref:db.doc(`opsCourseLedgers/${id}`),data:JSON.parse(JSON.stringify({version:2,seed,projection,revision,asOf:today,updatedAt:stamp}))});
    writes.push({kind:'create',ref:db.collection('opsAudit').doc(),data:{studentId:id,action:'project-lesson-ledger',at:stamp,detail:{previousRevision:stored.revision||'',revision,remainingBefore:e.account.remaining,remainingAfter:updated.remaining,previousMakeups:projection.previousMakeups,reflowFrom:reflowFrom||'',attendanceChanges:changed.map(r=>({before:e.attendance.find(o=>o.id===r.id)||null,after:r})),receiptIds:payments.map(p=>p.id)}}});
    mergedAccounts.push(updated);
   }
   if(writes.length>450)throw Error('변경 범위가 큽니다. 학생 또는 기간을 나누어 저장해주세요.');
   for(const w of writes){if(w.kind==='delete')real.delete(w.ref);else if(w.kind==='create')real.create(w.ref,w.data!);else if(w.kind==='update')real.update(w.ref,w.data!);else if(w.options)real.set(w.ref,w.data!,w.options as FirebaseFirestore.SetOptions);else real.set(w.ref,w.data!);}
   if(mergedAccounts.length&&result&&typeof result==='object'){
    const value=result as Record<string,unknown>;
    if(Array.isArray(value.accounts)||Array.isArray(value.attendance)||Array.isArray(value.invoices))return {...value,accounts:mergedAccounts,attendance:mergedAttendance,invoices:mergedInvoices} as T;
   }
   return result;
  });
 }});
}
