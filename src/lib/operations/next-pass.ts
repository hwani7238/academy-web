import {integer,seoulDay,validDay,type Account,type Invoice} from './model';
export type NextPass={units:number;amount:number;mode:'depleted'|'date';start:string;note:string;invoiceId:string;reservedOn:string};
export function nextPassInput(input:Record<string,unknown>,invoiceId:string,today=seoulDay()):NextPass{
 const units=integer(input.units,1,200,'등록 횟수'),amount=integer(input.amount,1,100000000,'수강료');
 if(input.mode!=='depleted'&&input.mode!=='date')throw Error('적용 시점을 선택해주세요.');
 const start=input.mode==='date'?validDay(input.start):'';
 if(start&&start<today)throw Error('예약일은 오늘 또는 이후 날짜로 선택해주세요. 이전 이력은 이력 수정에서 정정할 수 있습니다.');
 return {units,amount,mode:input.mode,start,note:typeof input.note==='string'?input.note.trim().slice(0,500):'',invoiceId,reservedOn:today};
}
export function nextPassDue(account:Account,day:string,status:string,previousStatus?:string){
 const next=account.nextPass;
 return !!next && status==='present' && previousStatus!=='present' && previousStatus!=='makeup' && day>=next.reservedOn && (next.mode==='date'?day>=next.start:account.remaining<=0);
}
export function activateNextPass(account:Account,invoice:Invoice,day:string,at:string):Account{
 const next=account.nextPass;
 if(!next||invoice.id!==next.invoiceId||invoice.studentId!==account.id||invoice.status==='cancelled'||!invoice.reservedPass||invoice.creditUnits!==0)throw Error('예약 수강권의 청구를 확인해주세요.');
 if(invoice.units!==next.units||invoice.amount!==next.amount)throw Error('예약 수강권과 청구 내용이 다릅니다.');
 return {...account,initialPlanUnits:account.initialPlanUnits||account.planUnits,planUnits:next.units,planAmount:next.amount,
 remaining:account.remaining+next.units,nextPass:null,updatedAt:at,
 openInvoiceId:invoice.status==='open'?invoice.id:account.openInvoiceId===invoice.id?null:account.openInvoiceId,
 passHistory:[...(account.passHistory||[]).filter(r=>r.start!==day),{start:day,units:next.units}].sort((a,b)=>a.start.localeCompare(b.start))};
}
