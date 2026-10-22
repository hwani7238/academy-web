import {attendanceSequence} from './attendance-sequence';
import {invoiceCycleStart} from './billing-display';
import {passUnitsOn} from './pass-history';
import {integer,type Snapshot,type Account,type Invoice} from './model';
export function monthlyPaymentOptions(data:Snapshot,studentId:string,day:string){
 const sequence=attendanceSequence(data.accounts,data.attendance,data.legacyAttendance||[],data.sequenceContext);
 const rows=[...data.invoices,...(data.settledInvoices||[])].filter(i=>i.studentId===studentId&&i.status!=='cancelled');
 const match=rows.filter(i=>invoiceCycleStart(i,sequence.cycleFirstDays,sequence.firstLessonTimes)===day);
 const unresolved=rows.filter(i=>!match.includes(i)&&!invoiceCycleStart(i,sequence.cycleFirstDays,sequence.firstLessonTimes));
 return {match,unresolved};
}
export function monthlyInvoice(account:Account,id:string,day:string,input:Record<string,unknown>,stamp:string):Invoice{
 const units=passUnitsOn(account,day),amount=integer(input.invoiceAmount,1,100000000,'원비');
 if(typeof input.addUnits!=='boolean')throw Error('수납 후 횟수 반영 방식을 확인해주세요.');
 return {id,studentId:account.id,name:account.name,units,amount,creditUnits:input.addUnits?units:0,lessonDate:day,paid:0,status:'open',needsReview:false,createdAt:stamp};
}
