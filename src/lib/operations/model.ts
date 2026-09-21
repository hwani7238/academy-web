export type Account = {
  id: string; name: string; phone: string; checkinSuffixes: string[];
  planUnits: number; planAmount: number; remaining: number; openInvoiceId: string | null;
  autoBilling: boolean; active: boolean; updatedAt: string;
};
export type Attendance = { id: string; studentId: string; name: string; day: string; at: string; units: number; note: string; updatedAt: string };
export type Invoice = { id: string; studentId: string; name: string; units: number; amount: number; paid: number; status: 'open' | 'paid' | 'cancelled'; needsReview: boolean; createdAt: string };
export type Payment = { id: string; invoiceId: string; studentId: string; amount: number; method: string; at: string; note: string };
export type Notice = { id: string; studentId: string; name: string; kind: 'attendance' | 'billing'; status: string; createdAt: string; requestId?: string; error?: string };
export type Device = { id: string; name: string; active: boolean; createdAt: string };
export type Snapshot = { students: { id: string; name: string; phone: string }[]; accounts: Account[]; attendance: Attendance[]; invoices: Invoice[]; payments: Payment[]; notices: Notice[]; devices: Device[]; day: string; configured: boolean };
export const METHODS = ['현금', '카드', '지역화폐', '계좌이체'] as const;
export function seoulDay(date = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date); }
export function suffixes(values: unknown) {
  if (!Array.isArray(values)) throw new Error('출석 번호를 입력해주세요.');
  return [...new Set(values.map(v => String(v).replace(/[^0-9]/g, '')).filter(v => v.length >= 4).map(v => v.slice(-4)))];
}
export function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} 값을 확인해주세요.`);
  return value;
}
export function adjustBalance(remaining: number, before: number, after: number) {
  integer(before, 0, 10, '기존 차감 횟수'); integer(after, 0, 10, '차감 횟수');
  return remaining + before - after;
}
export function settle(invoice: Invoice, amount: number) {
  integer(amount, 1, 100000000, '결제 금액');
  if (invoice.status !== 'open' || invoice.needsReview) throw new Error('청구 상태를 먼저 확인해주세요.');
  if (invoice.paid + amount > invoice.amount) throw new Error('미납 금액보다 큰 금액은 기록할 수 없습니다.');
  const paid = invoice.paid + amount;
  return { paid, complete: paid === invoice.amount };
}
