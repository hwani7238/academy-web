import { seoulDay, type Account, type Attendance, type Invoice, type Snapshot } from './model';

type Legacy = NonNullable<Snapshot['legacyAttendance']>[number];

export function legacyAttendanceAppearance(row: Legacy) {
  if (row.status) return { tone: row.status, label: row.status === 'present' ? '' : ({ absent: '결석', makeup: '보강', late_cancel: '당일 취소', travel: '여행', sick: '병가', cancelled: '취소' }[row.status] || '') };
  const color = row.color.toUpperCase().replace(/^#/, '').replace(/^FF(?=.{6}$)/, '');
  if (['CCCCCC', 'D9D9D9', 'B7B7B7'].includes(color) || /결석/.test(row.value)) return { tone: 'absent', label: '결석' };
  if (color === 'FF9900' || /보강/.test(row.value)) return { tone: 'makeup', label: '보강' };
  if (['FF00FF', '9900FF'].includes(color)) return { tone: 'payment-due', label: '결제' };
  if (/여행/.test(row.value)) return { tone: 'travel', label: '여행' };
  if (/병가/.test(row.value)) return { tone: 'sick', label: '병가' };
  return { tone: 'present', label: '' };
}

export function attendancePaymentDue(row: Pick<Attendance, 'day' | 'status' | 'units'>, account?: Account, invoice?: Invoice) {
  if (!invoice || invoice.status !== 'open' || invoice.paid >= invoice.amount || row.units <= 0 || !['present', 'makeup'].includes(row.status || 'present')) return false;
  if (invoice.cycleStart) return row.day >= invoice.cycleStart;
  // An ordinary renewal invoice is created on the final paid lesson. Only
  // subsequent lessons while the balance is negative belong to the unpaid pass.
  const created = new Date(invoice.createdAt);
  return Boolean(account && account.remaining < 0 && Number.isFinite(created.getTime()) && row.day > seoulDay(created));
}

export function paidFirstLesson(sequence: string | undefined, status: Attendance['status'], paymentDue: boolean) {
  return !paymentDue && ['present', 'makeup'].includes(status || 'present') && Boolean(sequence?.split('·').some(value => Number(value) === 1));
}

export function importedAttendanceAppearance(row: Legacy, account?: Account, invoice?: Invoice) {
  const appearance = legacyAttendanceAppearance(row);
  if (row.status === 'cancelled') return appearance;
  const status = appearance.tone === 'payment-due' ? 'present' : appearance.tone as Attendance['status'];
  const due = attendancePaymentDue({ day: row.day, status, units: 1 }, account, invoice);
  if (due) return { tone: 'payment-due', label: '결제 필요' };
  if (paidFirstLesson(row.value, status, false)) return { tone: 'paid-first', label: appearance.tone === 'makeup' ? '보강' : '결제 완료' };
  return appearance;
}
