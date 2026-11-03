import {type Account,type Attendance,type Invoice} from './model';
import {passDay,passInvoice,requireClearPassLinks} from './pass-link';

/** Replay only the affected suffix, preserving the ledger's opening balance and receipt identities. */
export function reconcileAttendance(account:Account,invoices:Invoice[],records:Attendance[],edited:Attendance,stamp:string,newId:string){
 const before=records.find(r=>r.id===edited.id);
 const latest=records.map(r=>r.day).sort().at(-1)||'';
 const changed=(before?.units||0)!==edited.units || (before?.relatedDay||'')!==(edited.relatedDay||'') || (before?.status||'')!==(edited.status||'');
 if(!changed || edited.day>latest || (!before&&edited.day===latest))return null;
 const active=invoices.filter(i=>i.studentId===account.id&&i.status!=='cancelled');
 const effective=[edited.day,before?.relatedDay,edited.relatedDay].filter(Boolean).sort()[0]!;
 const dated=active.filter(i=>i.allocationState==='allocated'&&passDay(i)).sort((a,b)=>passDay(a).localeCompare(passDay(b)));
 const anchor=dated.filter(i=>passDay(i)<effective).at(-1)||dated.find(i=>passDay(i)===effective);
 if(!anchor){
  if(dated.length)throw Error('첫 수강권 시작일 이전의 출석입니다. 이전 수강권 연결을 확인한 뒤 수정해주세요.');
  return null; // Unmigrated ledgers retain their existing opening-balance workflow.
 }
 requireClearPassLinks(active);
 if(active.some(i=>!i.passId))throw Error('이전 청구의 수강권 연결을 먼저 확인해주세요. 출석 변경은 저장되지 않았습니다.');
 const start=passDay(anchor),affected=active.filter(i=>i.id!==anchor.id&&(!passDay(i)||passDay(i)>start));
 if(new Set(dated.map(passDay)).size!==dated.length)throw Error('같은 시작일의 수강권이 여러 개입니다. 수강권 연결을 먼저 확인해주세요.');
 const queue=affected.sort((a,b)=>(passDay(a)||'9999').localeCompare(passDay(b)||'9999')||a.createdAt.localeCompare(b.createdAt));
 if(queue.filter(i=>i.allocationState==='pending'&&!passDay(i)&&!i.reservedPass).length>1)throw Error('시작일이 없는 수강권이 여러 개입니다. 적용 순서를 먼저 확인해주세요.');
 const previousPrefix=(row:Attendance)=>row.day===start?(row.passAllocations||[]).filter(p=>p.passId!==(anchor.passId||anchor.id)&&!affected.some(i=>(i.passId||i.id)===p.passId)):[];
 let balance=account.remaining+records.filter(r=>r.day>=start).reduce((n,r)=>n+r.units-previousPrefix(r).reduce((m,p)=>m+p.units,0),0)-affected.filter(i=>i.allocationState==='allocated').reduce((n,i)=>n+(i.allocatedUnits??i.units),0);
 let current={...anchor},planUnits=anchor.units,planAmount=anchor.amount,nextPass=account.nextPass;
 const all=[...records.filter(r=>r.id!==edited.id),edited].sort((a,b)=>a.day.localeCompare(b.day));
 const changedInvoices:Invoice[]=[],changedAttendance:Attendance[]=[],used=new Set<string>();
 const assigned=new Map(records.filter(r=>r.day<start).map(r=>[r.day,r.passId]));
 let serial=0;
 for(const row of all.filter(r=>r.day>=start)){
  const regular=row.units>0&&['present','late_cancel'].includes(row.status||'present');
  const allocations:NonNullable<Attendance['passAllocations']>=[...previousPrefix(row)];
  const prefixUnits=allocations.reduce((n,p)=>n+p.units,0);
  for(let unit=prefixUnits;unit<Math.max(row.units,1);unit++){
  const candidate=queue.find(i=>!used.has(i.id));
  const reservation=candidate?.renewalReservation || (candidate?.id===nextPass?.invoiceId?nextPass:undefined);
  const due=reservation?.mode==='date'?row.day>=reservation.start:balance<=0;
  const eligible=!reservation || (row.status==='present'&&row.day>=(reservation.mode==='date'?reservation.start:reservation.reservedOn));
  if(regular&&(row.day>start||unit>prefixUnits)&&due&&eligible){
   const raw=candidate||{id:`${newId}_${serial++}`,studentId:account.id,name:account.name,units:planUnits,amount:planAmount,paid:0,status:'open' as const,needsReview:false,createdAt:stamp};
   current={...passInvoice(raw,true,stamp),reservedPass:false,lessonDate:row.day,cycleStart:row.day,updatedAt:stamp,...(reservation?{renewalReservation:reservation}:{})};
   changedInvoices.push(current);used.add(raw.id);balance+=current.units;planUnits=current.units;planAmount=current.amount;
   if(nextPass?.invoiceId===raw.id)nextPass=null;
  }
  if(unit<row.units){
    const prior=allocations.at(-1),passId=current.passId||current.id;
    if(prior?.passId===passId)prior.units++;else allocations.push({passId,units:1,firstOrdinal:Math.max(1,current.units-balance+1),passUnits:current.units});
    balance--;
  }
  }
  const passId=row.relatedDay?(assigned.get(row.relatedDay)||records.find(r=>r.day===row.relatedDay)?.passId||current.passId):current.passId;
  assigned.set(row.day,passId);
  const updated={...row,passId:passId||current.id,passAllocations:regular&&allocations.length>1?allocations:[],updatedAt:stamp};
  if(row.id===edited.id||row.passId!==updated.passId||JSON.stringify(row.passAllocations||[])!==JSON.stringify(updated.passAllocations))changedAttendance.push(updated);

 }
 // Advance makeups can precede their source date; resolve them after all boundaries are known.
 for(const row of all.filter(r=>r.day>=start&&r.relatedDay)){
  const sourcePass=assigned.get(row.relatedDay!);
  if(!sourcePass)continue;
  const index=changedAttendance.findIndex(r=>r.id===row.id),existing=index>=0?changedAttendance[index]:row;
  if(existing.passId!==sourcePass){const fixed={...existing,passId:sourcePass,updatedAt:stamp};if(index>=0)changedAttendance[index]=fixed;else changedAttendance.push(fixed);}
 }
 for(const invoice of affected.filter(i=>!used.has(i.id)&&i.allocationState==='allocated')){
  if(invoice.paid>0)throw Error('출석 변경으로 이미 납부한 수강권의 시작 수업이 없어집니다. 수강권 시작일을 확인해주세요. 출석 변경은 저장되지 않았습니다.');
  const reservation=invoice.renewalReservation;
  if(reservation){if(nextPass&&nextPass.invoiceId!==invoice.id)throw Error('되돌릴 예약 수강권이 여러 개입니다. 적용 순서를 확인해주세요.');nextPass=reservation;}
  changedInvoices.push({...invoice,allocationState:'pending',allocatedUnits:0,allocationAt:'',lessonDate:reservation?.mode==='date'?reservation.start:'',cycleStart:'',reservedPass:!!reservation,updatedAt:stamp});
 }
 const history=(account.passHistory||[]).filter(h=>h.start<=start||!affected.some(i=>passDay(i)===h.start));
 for(const i of changedInvoices.filter(i=>i.allocationState==='allocated'))history.push({start:passDay(i),units:i.units});
 const open=changedInvoices.findLast(i=>i.status==='open'&&i.allocationState==='allocated') || (current.status==='open'?current:undefined) || active.find(i=>i.id===account.openInvoiceId&&i.status==='open');
 const updatedAccount:Account={...account,remaining:balance,currentPassId:current.passId||current.id,currentPassStart:passDay(current),lastPassLessonDay:all.filter(r=>r.units>0).at(-1)?.day||start,planUnits,planAmount,initialPlanUnits:account.initialPlanUnits||anchor.units,nextPass:nextPass||null,openInvoiceId:open?.id||null,passHistory:history.sort((a,b)=>a.start.localeCompare(b.start)),updatedAt:stamp};
 if(changedInvoices.length+changedAttendance.length>450)throw Error('변경할 출석이 너무 많습니다. 기간을 나눠 수강권 연결을 확인해주세요.');
 return {account:updatedAccount,invoices:changedInvoices,attendance:changedAttendance};
}
