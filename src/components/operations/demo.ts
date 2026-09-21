import { Snapshot, Account, adjustBalance, settle, seoulDay, suffixes } from '@/lib/operations/model';
export function sample(): Snapshot {
  const stamp = new Date().toISOString();
  const accounts: Account[] = [
    { id: 'demo-a', name: '김하늘', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 1, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-b', name: '이서준', phone: '01000005678', checkinSuffixes: ['5678'], planUnits: 12, planAmount: 210000, remaining: 4, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-c', name: '김하린', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 6, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
  ];
  return { accounts, students: accounts.map(({ id, name, phone }) => ({ id, name, phone })), attendance: [], invoices: [], payments: [], notices: [], devices: [], day: seoulDay(), configured: false };
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
  if (input.action === 'demoCheckIn') {
    if (!account?.active) throw new Error('학생 설정을 확인해주세요.');
    if (data.attendance.some(a => a.studentId === account.id && a.day === seoulDay())) return { data, result: { duplicate: true, name: account.name } };
    const id = `${account.id}_${seoulDay()}`;
    account.remaining = adjustBalance(account.remaining, 0, 1);
    data.attendance.unshift({ id, studentId: account.id, name: account.name, day: seoulDay(), at, units: 1, note: '', updatedAt: at });
    enqueue(account, `attendance_${id}`, 'attendance'); if (account.remaining <= 0) invoice(account);
    result = { name: account.name, duplicate: false };
  } else if (input.action === 'configure') {
    const student = data.students.find(s => s.id === input.studentId)!;
    const next: Account = { id: student.id, name: student.name, phone: String(input.phone), checkinSuffixes: suffixes(input.phones), planUnits: Number(input.planUnits), planAmount: Number(input.planAmount), remaining: account?.remaining ?? Number(input.remaining), openInvoiceId: account?.openInvoiceId || null, active: input.active !== false, autoBilling: input.autoBilling === true, updatedAt: at };
    data.accounts = [...data.accounts.filter(a => a.id !== student.id), next];
  } else if (input.action === 'invoice') { if (!account) throw new Error('수강 설정을 저장해주세요.'); if (account.openInvoiceId) throw new Error('진행 중인 청구가 있습니다.'); invoice(account); }
  else if (input.action === 'adjust') {
    const attendance = data.attendance.find(a => a.id === input.attendanceId)!;
    const a = data.accounts.find(a => a.id === attendance.studentId)!;
    if (!String(input.note || '').trim()) throw new Error('변경 사유를 적어주세요.');
    a.remaining = adjustBalance(a.remaining, attendance.units, Number(input.units)); attendance.units = Number(input.units); attendance.note = String(input.note);
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
