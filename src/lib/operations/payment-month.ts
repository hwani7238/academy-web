import {paymentDay} from './billing-display';
import {METHODS,type Payment} from './model';

export function paymentMonthBounds(month: string) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('조회 월을 확인해주세요.');
 const start = month + '-01';
 const next = new Date(start + 'T00:00:00Z');
 if (!Number.isFinite(next.getTime())) throw new Error('조회 월을 확인해주세요.');
 next.setUTCMonth(next.getUTCMonth() + 1);
 const end = next.toISOString().slice(0,10);
 return {start,end,atStart:new Date(start+'T00:00:00+09:00').toISOString(),atEnd:new Date(end+'T00:00:00+09:00').toISOString()};
}
export function monthlyPayments(payments: Payment[], month: string) {
 paymentMonthBounds(month);
 const rows = payments.filter(p=>paymentDay(p).slice(0,7)===month)
  .sort((a,b)=>paymentDay(b).localeCompare(paymentDay(a))||b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 const methods = [...new Set<string>([...METHODS,...rows.map(p=>p.method)])];
 return {rows,total:rows.reduce((sum,p)=>sum+p.amount,0),
  methods:methods.map(method=>({method,count:rows.filter(p=>p.method===method).length,
   amount:rows.filter(p=>p.method===method).reduce((sum,p)=>sum+p.amount,0)}))};
}
