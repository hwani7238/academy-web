import {type Invoice,type Payment} from './model';
import {passDay} from './pass-link';

// A receipt keeps the owner's explicitly chosen first day, even if an old
// activation bug subsequently moved the invoice to a different pass.
export function historicalPaymentConflict(invoice:Invoice|undefined,payment:Payment){
 if(!invoice||payment.cancelledAt||payment.invoiceId!==invoice.id||payment.studentId!==invoice.studentId||!payment.lessonDate||invoice.status!=='paid'||invoice.allocationState!=='allocated'||!invoice.passId||payment.passId!==invoice.passId||!payment.at||!invoice.allocationAt||invoice.allocationAt<=payment.at)return undefined;
 const currentStart=passDay(invoice),originalStart=payment.lessonDate;
 return currentStart&&originalStart<currentStart?{originalStart,currentStart}:undefined;
}
