import type { Invoice } from './model';

// Keep this course's current unpaid claim in sync; historical receipts stay fixed.
export function invoiceForPlan(invoice: Invoice, studentId: string, units: number, amount: number, at: string): Invoice | undefined {
  if (invoice.studentId !== studentId) throw Error('다른 과목의 청구가 연결돼 있습니다. 청구 연결을 확인해주세요.');
  if (invoice.status !== 'open' || (invoice.amount === amount && invoice.units === units)) return;
  if (invoice.paid > 0 && amount <= invoice.paid) throw Error('변경할 수강료가 이미 수납한 금액 이하입니다. 수납 내역을 먼저 확인해주세요.');
  return { ...invoice, units, amount, creditUnits: invoice.creditUnits === 0 ? 0 : units,
    updatedAt: new Date(Math.max(Date.parse(at), (Date.parse(invoice.updatedAt || '') || 0) + 1)).toISOString() };
}
