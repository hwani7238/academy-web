import { Snapshot, Account, adjustBalance, settle, seoulDay, suffixes, attendanceInput } from '@/lib/operations/model';
export function sample(): Snapshot {
  const stamp = new Date().toISOString();
  const accounts: Account[] = [
    { id: 'demo-a', sourceStudentId: 'person-a', subject: '어린이 피아노', name: '김하늘 · 어린이 피아노', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 1, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-b', sourceStudentId: 'person-b', subject: '통기타', name: '이서준 · 통기타', phone: '01000005678', checkinSuffixes: ['5678'], planUnits: 12, planAmount: 210000, remaining: 4, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-c', sourceStudentId: 'person-c', subject: '성인 피아노', name: '김하린 · 성인 피아노', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 6, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
  ];
  accounts.push({ ...accounts[2], id: 'demo-c-vocal', subject: '보컬', name: '김하린 · 보컬', planUnits: 4, planAmount: 180000, remaining: 2 });
  return { accounts, students: accounts.map(({ id, name, phone, sourceStudentId, subject }) => ({ id, name, phone, sourceStudentId, subject, instruments: subject ? [subject] : [] })), attendance: [], invoices: [], payments: [], notices: [], devices: [], day: seoulDay(), configured: false };
}
export function demoAction(current: Snapshot, input: Record<string, unknown>): { data: Snapshot; result: Record<string, unknown> } {
  const data = structuredClone(current); const at = new Date().toISOString();
  const account = data.accounts.find(a => a.id === input.studentId);
  const enqueue = (a: Account, id: string, kind: 'attendance' | 'billing') => data.notices.unshift({ id, studentId: a.id, name: a.name, kind, status: 'demo', createdAt: at });
  const invoice = (a: Account) => {
    if (a.openInvoiceId) return;
    const id = crypto.randomUUID(); a.openInvoiceId = id;
    data.invoices.push({ id, studentId: a.id, name: a.name, units: a.planUnits, amount: a.planAmount, paid: 0, status: 'open', needsReview: false, createdAt: at });
    if (a.autoBilling) enqueue(a, `billing_${id}`, 'billing');
  };
  let result: Record<string, unknown> = { ok: true };
  if (input.action === 'recordAttendance') {
    const values = attendanceInput(input);
    if (!account) throw new Error('먼저 수강 설정을 저장해주세요.');
    const id = `${account.id}_${values.day}`; const old = data.attendance.find(a => a.id === id);
    account.remaining = adjustBalance(account.remaining, old?.units || 0, values.units);
    data.attendance = data.attendance.filter(a => a.id !== id);
    data.attendance.push({ ...old, ...values, id, studentId: account.id, name: account.name, at: old?.at || at, source: old?.source || 'manual', updatedAt: at });
    if (account.remaining <= 0 && values.units > (old?.units || 0)) invoice(account);
    if (account.remaining > 0) { const open = data.invoices.find(i => i.id === account.openInvoiceId); if (open) open.needsReview = true; }
  } else if (input.action === 'demoCheckIn') {
    if (!account?.active) throw new Error('학생 설정을 확인해주세요.');
    const existing = data.attendance.find(a => a.studentId === account.id && a.day === seoulDay());
    if (existing?.status === 'absent' || existing?.status === 'cancelled') throw new Error('오늘 결석·취소 기록이 있습니다. 선생님께 출석 변경을 요청해주세요.');
    if (existing) return { data, result: { duplicate: true, name: account.name } };
    const id = `${account.id}_${seoulDay()}`;
    account.remaining = adjustBalance(account.remaining, 0, 1);
    data.attendance.unshift({ id, studentId: account.id, name: account.name, day: seoulDay(), at, units: 1, note: '', updatedAt: at });
    enqueue(account, `attendance_${id}`, 'attendance'); if (account.remaining <= 0) invoice(account);
    result = { name: account.name, duplicate: false };
  } else if (input.action === 'configure') {
    const student = data.students.find(s => s.id === input.studentId)!;
    const next: Account = { id: student.id, sourceStudentId: student.sourceStudentId, subject: student.subject, name: student.name, phone: String(input.phone), checkinSuffixes: suffixes(input.phones), planUnits: Number(input.planUnits), planAmount: Number(input.planAmount), remaining: account?.remaining ?? Number(input.remaining), openInvoiceId: account?.openInvoiceId || null, active: input.active !== false, autoBilling: input.autoBilling === true, updatedAt: at };
    data.accounts = [...data.accounts.filter(a => a.id !== student.id), next];
  } else if (input.action === 'invoice') { if (!account) throw new Error('수강 설정을 저장해주세요.'); if (account.openInvoiceId) throw new Error('진행 중인 청구가 있습니다.'); invoice(account); }
  else if (input.action === 'adjust') {
    const attendance = data.attendance.find(a => a.id === input.attendanceId)!;
    const a = data.accounts.find(a => a.id === attendance.studentId)!;
    a.remaining = adjustBalance(a.remaining, attendance.units, Number(input.units)); attendance.units = Number(input.units); attendance.note = String(input.note || '').trim().slice(0, 500);
    if (a.remaining <= 0) invoice(a);
    else { const open = data.invoices.find(i => i.id === a.openInvoiceId); if (open) open.needsReview = true; }
  } else if (input.action === 'payment') {
    if (data.payments.some(p => p.id === input.requestId)) return { data, result };
    const i = data.invoices.find(i => i.id === input.invoiceId)!; const s = settle(i, Number(input.amount));
    i.paid = s.paid;
    if (s.complete) { i.status = 'paid'; const a = data.accounts.find(a => a.id === i.studentId)!; a.remaining += i.units; a.openInvoiceId = null; }
    data.payments.unshift({ id: String(input.requestId), invoiceId: i.id, studentId: i.studentId, amount: Number(input.amount), method: String(input.method), at, note: String(input.note || '') });
  } else if (['sendInvoice', 'cancelInvoice', 'confirmInvoice'].includes(String(input.action))) {
    const i = data.invoices.find(i => i.id === input.invoiceId)!;
    if (input.action === 'confirmInvoice') i.needsReview = false;
    else if (input.action === 'cancelInvoice') { if (i.paid) throw new Error('수납된 청구는 취소할 수 없습니다.'); i.status = 'cancelled'; data.accounts.find(a => a.id === i.studentId)!.openInvoiceId = null; }
    else { if (i.needsReview) throw new Error('청구 내용을 확인해주세요.'); if (data.notices.some(n => n.id === `billing_${i.id}`)) throw new Error('이미 요청 기록이 있습니다.'); enqueue(data.accounts.find(a => a.id === i.studentId)!, `billing_${i.id}`, 'billing'); }
  } else if (input.action === 'pair') result = { code: '체험에서는 실제 기기를 등록하지 않습니다.' };
  else if (input.action === 'process') result = { submitted: 0 };
  data.invoices = data.invoices.filter(i => i.status === 'open');
  return { data, result };
}
