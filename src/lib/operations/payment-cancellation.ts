import {integer,type Account,type Invoice,type Payment} from './model';

// Reverse a receipt, not an attendance event. A pass was credited only when
// its invoice crossed from partially paid to fully paid.
export function paymentCancellation(payment:Payment,invoice:Invoice,account:Account){
 if(payment.cancelledAt)throw Error('이미 취소된 수납입니다.');
 if(payment.invoiceId!==invoice.id||payment.studentId!==invoice.studentId||account.id!==invoice.studentId)throw Error('수납과 과목 정보가 일치하지 않습니다.');
 if(invoice.status==='cancelled')throw Error('취소된 청구입니다. 청구 내역을 먼저 확인해주세요.');
 integer(payment.amount,1,100000000,'수납 금액');
 integer(invoice.paid,payment.amount,invoice.amount,'누적 수납 금액');
 if((invoice.status==='paid')!==(invoice.paid===invoice.amount))throw Error('청구의 수납 상태를 먼저 확인해주세요.');
 const revertedUnits=invoice.status==='paid'?integer(invoice.creditUnits??invoice.units,0,200,'추가된 횟수'):0;
 return {paid:invoice.paid-payment.amount,revertedUnits,remaining:account.remaining-revertedUnits};
}
