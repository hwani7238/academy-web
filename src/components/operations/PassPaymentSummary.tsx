import type {Invoice,Account} from '@/lib/operations/model';
export function PassPaymentSummary({invoice,account}:{invoice:Invoice;account?:Account}){
 return <div className="notice"><strong>{invoice.lessonDate||invoice.cycleStart||'1회차 날짜 연결 필요'} · {invoice.units}회권</strong>
 <p>{invoice.reservedPass||invoice.allocationState==='pending'?'수강권을 시작하는 첫 출석 때 횟수가 한 번 반영됩니다. 선납해도 현재 횟수는 바뀌지 않습니다.':'이미 시작한 수강권입니다. 수납·수납 취소로 횟수를 다시 더하거나 빼지 않습니다.'}</p>
 {account&&<p>수납 전후 잔여 <strong>{account.remaining}회 → {account.remaining}회</strong></p>}</div>;
}
