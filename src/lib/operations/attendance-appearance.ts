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

export function isFirstLesson(sequence: string | undefined, status: Attendance['status']) {
  return (status || 'present') === 'present' && Boolean(sequence?.split('·').some(value => Number(value) === 1));
}

export function paidFirstLesson(sequence: string | undefined, status: Attendance['status'], paymentDue: boolean, confirmed = false) {
  return confirmed && !paymentDue && isFirstLesson(sequence, status);
}

// A previous payment must never paint every later pass as paid. Explicit cycle
// dates win; an ordinary advance renewal belongs only to the first cycle after
// its creation day. Same-day/ambiguous renewals need an explicit cycle date.
export function confirmedFirstLessons(invoices: Invoice[], cycleFirstDays: Record<string, string[]>) {
  const byLesson = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const created = new Date(invoice.createdAt);
    const day = invoice.cycleStart || (Number.isFinite(created.getTime())
      ? [...(cycleFirstDays[invoice.studentId] || [])].sort().find(day => day > seoulDay(created)) : undefined);
    if (!day) continue;
    const key = `${invoice.studentId}_${day}`;
    byLesson.set(key, [...(byLesson.get(key) || []), invoice]);
  }
  return new Set([...byLesson].filter(([, rows]) => rows.every(i => i.status === 'paid' && i.amount > 0 && i.paid >= i.amount && !i.needsReview)).map(([key]) => key));
}

export function importedAttendanceAppearance(row: Legacy, account?: Account, invoice?: Invoice, confirmed = false) {
  const appearance = legacyAttendanceAppearance(row);
  if (row.status === 'cancelled') return appearance;
  const status = appearance.tone === 'payment-due' ? 'present' : appearance.tone as Attendance['status'];
  const due = attendancePaymentDue({ day: row.day, status, units: 1 }, account, invoice);
  if (due) return { tone: 'payment-due', label: '결제 필요' };
  if (isFirstLesson(row.value, status)) return confirmed
    ? { tone: 'paid-first', label: '결제 완료' }
    : { tone: 'payment-due', label: '결제 확인 필요' };
  return appearance;
}
