import {integer,seoulDay,validDay,type Account,type Invoice,type Attendance} from './model';
export type NextPass={units:number;amount:number;mode:'depleted'|'date';start:string;note:string;invoiceId:string;reservedOn:string};
export function nextPassInput(input:Record<string,unknown>,invoiceId:string,today=seoulDay()):NextPass{
 const units=integer(input.units,1,200,'등록 횟수'),amount=integer(input.amount,1,100000000,'수강료');
 if(input.mode!=='depleted'&&input.mode!=='date')throw Error('적용 시점을 선택해주세요.');
 const start=input.mode==='date'?validDay(input.start):'';
 return {units,amount,mode:input.mode,start,note:typeof input.note==='string'?input.note.trim().slice(0,500):'',invoiceId,reservedOn:today};
}
export function nextPassDue(account:Account,day:string,status:string,previousStatus?:string){
 const next=account.nextPass;
 return !!next && status==='present' && previousStatus!=='present' && previousStatus!=='makeup' && (next.mode==='date'?day>=next.start:day>=next.reservedOn&&account.remaining<=0);
}
export function activateNextPass(account:Account,invoice:Invoice,day:string,at:string):Account{
 const next=account.nextPass;
 if(!next||invoice.id!==next.invoiceId||invoice.studentId!==account.id||invoice.status==='cancelled'||!invoice.reservedPass||invoice.creditUnits!==0)throw Error('예약 수강권의 청구를 확인해주세요.');
 if(invoice.units!==next.units||invoice.amount!==next.amount)throw Error('예약 수강권과 청구 내용이 다릅니다.');
 return {...account,initialPlanUnits:account.initialPlanUnits||account.planUnits,planUnits:next.units,planAmount:next.amount,
 remaining:account.remaining+(invoice.allocationState==='allocated'?0:next.units),currentPassId:invoice.passId||invoice.id,currentPassStart:day,lastPassLessonDay:day,nextPass:null,updatedAt:at,
 ...(next.mode==='date'&&next.start<=next.reservedOn?{referenceResetFrom:account.referenceResetFrom&&account.referenceResetFrom<day?account.referenceResetFrom:day}:{}),
 openInvoiceId:invoice.status==='open'?invoice.id:account.openInvoiceId===invoice.id?null:account.openInvoiceId,
 passHistory:[...(account.passHistory||[]).filter(r=>r.start!==day),{start:day,units:next.units}].sort((a,b)=>a.start.localeCompare(b.start))};
}

/** Reconcile a dated change against recorded attendance, without replaying deductions. */
export function recordedPassStart(account:Account,next:NextPass,records:Attendance[],invoices:Invoice[],today=seoulDay()){
 if(next.mode!=='date'||next.start>today)return undefined;
 const first=records.filter(r=>r.studentId===account.id&&r.day>=next.start&&r.day<=today&&(r.status||'present')==='present')
  .sort((a,b)=>a.day.localeCompare(b.day))[0]?.day;
 if(account.passHistory?.some(r=>r.start>=next.start))throw Error('선택한 날짜 이후에 이미 적용된 수강권이 있습니다. 이전 수강권 이력에서 확인해주세요.');
 if(invoices.some(i=>i.id!==next.invoiceId&&i.status!=='cancelled'&&!i.reservedPass&&(i.lessonDate||i.cycleStart||'')>=next.start))
  throw Error('선택한 날짜 이후에 다른 수강권 청구가 있습니다. 해당 청구의 1회차 날짜를 먼저 확인해주세요.');
 return first;
}
