import { type Invoice, type Payment, seoulDay, validDay } from './model';

export function paymentDateInput(value: unknown) {
  const day = value === undefined ? seoulDay() : validDay(value);
  if (day > seoulDay()) throw Error('결제받은 날짜는 오늘 또는 이전 날짜로 입력해주세요.');
  return day;
}
export const paymentDay = (payment: Payment) => payment.paymentDate || seoulDay(new Date(payment.at));
export function invoiceCycleStart(invoice: Invoice, cycleFirstDays: Record<string, string[]>) {
  if (invoice.cycleStart) return invoice.cycleStart;
  const created = new Date(invoice.createdAt);
  // A first registration can start on its creation day; renewal invoices are for the following pass.
  const initial = invoice.id === `first_${invoice.studentId}`;
  return Number.isFinite(created.getTime())
    ? [...(cycleFirstDays[invoice.studentId] || [])].sort().find(day => initial ? day >= seoulDay(created) : day > seoulDay(created)) : undefined;
}
export function courseInitial(subject: string) {
  if (subject.includes('피아노')) {
    if (subject.includes('1관')) return 'PF(1)';
    if (subject.includes('2관')) return 'PF(2)';
    if (subject.includes('성인')) return 'PF(A)';
    return 'PF(?)';
  }
  return ({ 드럼:'D', 우쿨렐레:'UK', 우쿨레레:'UK', 보컬:'V', 기타:'G', 통기타:'G', 일렉기타:'EG', 베이스:'BG', 앙상블:'ENS', 미디:'MIDI' } as Record<string,string>)[subject] || subject;
}
export function shortBillingDay(day: string) { return `${Number(day.slice(5,7))}/${Number(day.slice(8))}`; }
