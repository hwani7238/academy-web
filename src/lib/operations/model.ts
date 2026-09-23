export type Account = {
  sourceStudentId?: string; subject?: string; importId?: string; openingAsOf?: string;
  id: string; name: string; phone: string; checkinSuffixes: string[];
  planUnits: number; planAmount: number; remaining: number; openInvoiceId: string | null;
  autoBilling: boolean; active: boolean; updatedAt: string;
};
export const ATTENDANCE_LABELS = { present: "출석", absent: "결석", makeup: "보강", late_cancel: "당일 취소", travel: "여행", sick: "병가", cancelled: "취소" } as const;
export type AttendanceStatus = keyof typeof ATTENDANCE_LABELS;
export type Attendance = { status?: AttendanceStatus; source?: "kiosk" | "manual"; relatedDay?: string; id: string; studentId: string; name: string; day: string; at: string; units: number; note: string; updatedAt: string };
export type Invoice = { id: string; studentId: string; name: string; units: number; amount: number; paid: number; status: 'open' | 'paid' | 'cancelled'; needsReview: boolean; createdAt: string };
export type Payment = { id: string; invoiceId: string; studentId: string; amount: number; method: string; at: string; note: string };
export type Notice = { id: string; studentId: string; name: string; kind: 'attendance' | 'billing'; status: string; createdAt: string; requestId?: string; error?: string };
export type Device = { id: string; name: string; active: boolean; createdAt: string };
export type Snapshot = { legacyAttendance?: { studentId: string; day: string; value: string; color: string }[]; students: { id: string; name: string; phone: string; sourceStudentId?: string; subject?: string; importId?: string; openingAsOf?: string; instruments?: string[]; attendanceGroup?: string }[]; accounts: Account[]; attendance: Attendance[]; invoices: Invoice[]; payments: Payment[]; notices: Notice[]; devices: Device[]; day: string; configured: boolean };
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

export function validDay(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('날짜를 확인해주세요.');
  return value;
}
export function attendanceInput(input: Record<string, unknown>) {
  const day = validDay(input.day);
  if (day > seoulDay()) throw new Error('미래 날짜의 출결은 기록할 수 없습니다.');
  const status = input.status as AttendanceStatus;
  if (!Object.hasOwn(ATTENDANCE_LABELS, status)) throw new Error('출결 상태를 선택해주세요.');
  const units = integer(input.units, 0, 10, '차감 횟수');
  if (status === 'cancelled' && units !== 0) throw new Error('취소 기록은 0회 차감으로 저장해주세요.');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const relatedDay = status === 'makeup' && input.relatedDay ? validDay(input.relatedDay) : '';
  if (relatedDay && relatedDay > day) throw new Error('원래 수업일은 보강일보다 늦을 수 없습니다.');
  return { day, status, units, note, relatedDay };
}

export function defaultAttendanceUnits(status: AttendanceStatus, subject = '') {
  return status === 'present' || status === 'makeup' || (status === 'late_cancel' && !subject.includes('피아노')) ? 1 : 0;
}
