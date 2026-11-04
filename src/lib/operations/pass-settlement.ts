import type { Attendance, Invoice, Payment } from './model';

export const passStart = (invoice: Invoice) => invoice.lessonDate || invoice.cycleStart || '';
export const receiptComplete = (invoice: Invoice) => invoice.status === 'paid' && invoice.amount > 0 && invoice.paid >= invoice.amount && !invoice.needsReview && !invoice.linkReview;

/** A stable pass id is not permission to pay every later cycle. A moved first
 * lesson may retain it only when no other first lesson separates the dates. */
export function passCoversFirst(invoice: Invoice, row: Pick<Attendance, 'studentId' | 'day' | 'passId'>, starts: string[]) {
  if (invoice.studentId !== row.studentId || invoice.status === 'cancelled') return false;
  const start = passStart(invoice);
  if (!start) return false;
  if (start === row.day) return true;
  if (!row.passId || row.passId !== invoice.passId) return false;
  const from = start < row.day ? start : row.day, to = start > row.day ? start : row.day;
  return !starts.some(day => day >= from && day <= to && day !== row.day);
}

export function duplicateReceipts(payments: Payment[], studentId: string, amount: number, method: string, day: string, requestId: string) {
  return payments.filter(p => p.studentId === studentId && !p.cancelledAt && p.id !== requestId && p.amount === amount && p.method === method &&
    (p.paymentDate || new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date(p.at))) === day);
}

export function requireDistinctReceipt(payments: Payment[], studentId: string, input: Record<string, unknown>, day: string, method: string) {
  const matches = duplicateReceipts(payments, studentId, Number(input.amount), method, day, String(input.requestId));
  if (!matches.length) return [];
  const expected = matches.map(p => p.id).sort().join(',');
  if (input.duplicateReceiptIds !== expected || typeof input.duplicateReceiptReason !== 'string' || input.duplicateReceiptReason.trim().length < 5)
    throw Error(`중복 수납 확인: ${day} ${method} ${Number(input.amount).toLocaleString('ko-KR')}원 수납 ${matches.length}건이 이미 있습니다. 같은 결제를 다시 입력하는 경우 기존 수납을 연결하세요. 실제 별도 결제라면 확인 사유를 입력해주세요. [기존 수납: ${expected}]`);
  return matches.map(p => p.id);
}
