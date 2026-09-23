import { enrollmentState, lifecycleInput } from './lifecycle';
import { randomUUID, randomBytes } from 'node:crypto';
import { registrationInput } from './registration';
import type { Transaction, Firestore } from 'firebase-admin/firestore';
import { database, hash, HttpError } from './auth';
import { Account, Invoice, Attendance, integer, adjustBalance, settle, suffixes, seoulDay, METHODS, attendanceInput } from './model';

const now = () => new Date().toISOString();
const key = (id: unknown) => { if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('잘못된 항목입니다.'); return id; };
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function audit(tx: Transaction, db: Firestore, actor: string, action: string, studentId: string, detail: object) {
  tx.create(db.collection('opsAudit').doc(), { actor, action, studentId, detail, at: now() });
}
function enqueue(tx: Transaction, db: Firestore, id: string, account: Account, kind: 'attendance' | 'billing', parameters: Record<string, string>) {
  tx.create(db.doc(`opsNotices/${id}`), { id, studentId: account.id, name: account.name, phone: account.phone, kind, parameters, status: 'queued', createdAt: now() });
}
function newInvoice(tx: Transaction, db: Firestore, account: Account, id: string, reason: string, createdAt = now()) {
  const invoice: Invoice = { id, studentId: account.id, name: account.name, units: account.planUnits, amount: account.planAmount, paid: 0, status: 'open', needsReview: false, createdAt };
  tx.create(db.doc(`opsInvoices/${id}`), { ...invoice, reason });
  if (account.autoBilling) enqueue(tx, db, `billing_${id}`, account, 'billing', { student_name: account.name, amount: String(invoice.amount), lesson_count: String(invoice.units) });
  return id;
}
export function enrollmentId(studentId: string, subject: string) {
  return `course_${hash(JSON.stringify([studentId, subject]))}`;
}
export async function changeLifecycle(input: Record<string, unknown>, actor: string) {
  const id = key(input.sourceStudentId); const values = lifecycleInput(input); const db = database();
  return db.runTransaction(async tx => {
    const ref = db.doc(`students/${id}`); const student = (await tx.get(ref)).data();
    if (!student) throw Error('학생을 찾을 수 없습니다.');
    const old = student.lifecycle;
    if (old && old.status === values.status && old.until === values.until && old.note === values.note) return { lifecycle: { sourceStudentId:id, value:old } };
    if ((old?.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw Error('학생 상태가 변경됐습니다. 새로고침 후 다시 확인해주세요.');
    const value = { ...values, updatedAt: now() };
    tx.update(ref, { lifecycle: value });
    audit(tx, db, actor, 'student-lifecycle', id, { before: old || null, ...values });
    return { lifecycle: { sourceStudentId:id, value } };
  });
}
export async function registerStudent(input: Record<string, unknown>, actor: string) {
  const v = registrationInput(input); const requestId = key(input.requestId);
  const db = database(); const digest = hash(JSON.stringify(v));
  const identity = hash(JSON.stringify([v.name.replace(/\s/g, ''), v.phone]));
  const sourceStudentId = `registered_${identity}`;
  const id = enrollmentId(sourceStudentId, v.subject);
  const students = await db.collection('students').get();
  if (students.docs.some(d => d.id !== sourceStudentId && String(d.data().name || '').replace(/\s/g, '') === v.name.replace(/\s/g, '') && String(d.data().phone || '').replace(/\D/g, '') === v.phone)) throw Error('같은 이름과 전화번호의 학생이 이미 있습니다. 총 등록 현황에서 확인해주세요.');
  return db.runTransaction(async tx => {
    const studentRef = db.doc(`students/${sourceStudentId}`); const accountRef = db.doc(`opsAccounts/${id}`);
    const old = await tx.get(studentRef);
    if (old.exists) {
      if (old.data()?.registrationRequestId === requestId && old.data()?.registrationDigest === digest) return { ok: true, studentId: id, duplicate: true };
      throw Error('이미 등록된 학생입니다. 총 등록 현황에서 확인해주세요.');
    }
    const at = now();
    tx.create(studentRef, { name: v.name, phone: v.phone, instruments: [v.subject], instrument: v.subject, phoneLast4: v.phone.slice(-4), teachers: [], status: '등록', createdAt: new Date(), registrationRequestId: requestId, registrationDigest: digest });
    tx.create(accountRef, { id, sourceStudentId, subject: v.subject, displaySubject: v.subject, attendanceGroup: v.group,
      name: `${v.name} · ${v.subject}`, phone: v.phone, checkinSuffixes: [...new Set([v.phone.slice(-4), ...(v.personalPhone ? [v.personalPhone.slice(-4)] : [])])],
      planUnits: v.planUnits, planAmount: v.planAmount, remaining: v.remaining, openInvoiceId: null, autoBilling: false, active: true, updatedAt: at });
    audit(tx, db, actor, 'register-student', id, { sourceStudentId, group: v.group, planUnits: v.planUnits, planAmount: v.planAmount, remaining: v.remaining });
    return { ok: true, studentId: id };
  });
}
export function studentSubjects(student: Record<string, unknown>): string[] {
  const raw = Array.isArray(student.instruments) && student.instruments.length ? student.instruments : [student.instrument];
  return [...new Set(raw.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).map(v => v.trim()))];
}
export function resolveImportedSubjects(subjects: string[], source: string) {
  const aliases: Record<string, string> = { '기타': '통기타', '일렉': '일렉기타', '피아노(어린이)': '어린이 피아노', '피아노(성인)': '성인 피아노' };
  return subjects.filter(s => (aliases[s] || s) === source || (s === '피아노' && ['어린이 피아노', '성인 피아노'].includes(source)));
}
export async function configure(input: Record<string, unknown>, actor: string) {
  const db = database(); const id = key(input.studentId); const ref = db.doc(`opsAccounts/${id}`);
  const sourceStudentId = input.sourceStudentId ? key(input.sourceStudentId) : id;
  const subject = text(input.subject, 80);
  if (input.sourceStudentId && (!subject || enrollmentId(sourceStudentId, subject) !== id)) throw new Error('과목별 수강권 정보가 올바르지 않습니다.');
  const planUnits = integer(input.planUnits, 1, 200, '등록 횟수');
  const planAmount = integer(input.planAmount, 1, 100000000, '수강료');
  const codes = suffixes(input.phones);
  if (!codes.length || codes.length > 5) throw new Error('출석 번호를 1~5개 등록해주세요.');
  const phone = text(input.phone, 30).replace(/[^0-9]/g, '');
  if (!/^0[0-9]{8,10}$/.test(phone)) throw new Error('알림 수신 전화번호를 확인해주세요.');
  await db.runTransaction(async tx => {
    const [existing, student] = await Promise.all([tx.get(ref), tx.get(db.doc(`students/${sourceStudentId}`))]);
    if (!student.exists) throw new Error('학생을 찾을 수 없습니다.');
    if (subject && !studentSubjects(student.data() || {}).includes(subject)) throw new Error('등록된 과목을 확인해주세요.');
    if (subject && (await tx.get(db.doc(`opsAccounts/${sourceStudentId}`))).exists) throw new Error('기존 통합 수강권을 과목별로 분리한 후 등록해주세요.');
    const old = existing.data();
    const remaining = old ? old.remaining : integer(input.remaining, -1000, 1000, '현재 남은 횟수');
    tx.set(ref, { id, ...(old?.importId ? { importId: old.importId, openingAsOf: old.openingAsOf } : {}), ...(old?.attendanceGroup ? { attendanceGroup: old.attendanceGroup } : {}), ...(old?.displaySubject ? { displaySubject: old.displaySubject } : {}), ...(subject ? { sourceStudentId, subject } : {}), name: subject ? `${student.data()?.name || '학생'} · ${subject}` : student.data()?.name || '학생', phone, checkinSuffixes: codes, planUnits, planAmount, remaining, openInvoiceId: old?.openInvoiceId || null, active: input.active !== false, autoBilling: input.autoBilling === true, updatedAt: now() });
    audit(tx, db, actor, 'configure', id, { planUnits, planAmount, remaining, active: input.active !== false, autoBilling: input.autoBilling === true });
  });
}
export async function checkIn(studentId: string, digits: string, actor: string) {
  const db = database(); const id = key(studentId); const day = seoulDay(); const attendanceId = `${id}_${day}`;
  const ref = db.doc(`opsAccounts/${id}`); const attendanceRef = db.doc(`opsAttendance/${attendanceId}`);
  const invoiceId = randomUUID();
  return db.runTransaction(async tx => {
    const [accountSnap, attended] = await Promise.all([tx.get(ref), tx.get(attendanceRef)]);
    const account = accountSnap.data() as Account | undefined;
    if (!account?.active || !account.checkinSuffixes.includes(digits)) throw new HttpError(404, '등록된 학생을 찾을 수 없습니다.');
    const owner = (await tx.get(db.doc(`students/${account.sourceStudentId || id}`))).data();
    if (!owner || enrollmentState(owner.lifecycle) !== 'active') throw new HttpError(409, '휴원·퇴원 상태입니다. 선생님께 복귀 처리를 요청해주세요.');
    if (!attended.exists && account.importId && account.openingAsOf === day) {
      const imported = (await tx.get(db.doc(`opsImports/${account.importId}`))).data();
      if (imported?.history?.some((h: { cells?: { day: string }[] }) => h.cells?.some(c => c.day === day))) {
        return { duplicate: true, name: account.name };
      }
    }
    if (attended.exists) {
      const status = attended.data()?.status || 'present';
      if (status !== 'present' && status !== 'makeup') throw new HttpError(409, '오늘 결석·취소 기록이 있습니다. 선생님께 출석 변경을 요청해주세요.');
      return { duplicate: true, name: account.name };
    }
    const remaining = adjustBalance(account.remaining, 0, 1);
    const openInvoiceId = remaining <= 0 && !account.openInvoiceId ? newInvoice(tx, db, account, invoiceId, '수업 횟수 소진') : account.openInvoiceId;
    tx.create(attendanceRef, { id: attendanceId, studentId: id, name: account.name, day, at: now(), units: 1, status: 'present', source: 'kiosk', note: '', updatedAt: now() });
    tx.update(ref, { remaining, openInvoiceId, updatedAt: now() });
    enqueue(tx, db, `attendance_${attendanceId}`, account, 'attendance', { student_name: account.name, attendance_time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) });
    audit(tx, db, actor, 'check-in', id, { attendanceId, units: 1, remaining });
    return { duplicate: false, name: account.name };
  });
}
export async function adjust(input: Record<string, unknown>, actor: string) {
  const db = database(); const id = key(input.attendanceId); const units = integer(input.units, 0, 10, '차감 횟수'); const note = text(input.note);
  const invoiceId = randomUUID();
  await db.runTransaction(async tx => {
    const attendanceRef = db.doc(`opsAttendance/${id}`); const attendance = (await tx.get(attendanceRef)).data() as Attendance | undefined;
    if (!attendance) throw new Error('출석 기록을 찾을 수 없습니다.');
    if (attendance.status === 'cancelled' && units !== 0) throw new Error('취소 기록은 월별 출석표에서 상태를 먼저 변경해주세요.');
    const ref = db.doc(`opsAccounts/${attendance.studentId}`); const account = (await tx.get(ref)).data() as Account;
    const currentInvoice = account.openInvoiceId ? await tx.get(db.doc(`opsInvoices/${account.openInvoiceId}`)) : null;
    const remaining = adjustBalance(account.remaining, attendance.units, units);
    const openInvoiceId = remaining <= 0 && !account.openInvoiceId ? newInvoice(tx, db, account, invoiceId, '횟수 수정 후 소진') : account.openInvoiceId;
    if (remaining > 0 && currentInvoice?.exists) tx.update(currentInvoice.ref, { needsReview: true });
    tx.update(ref, { remaining, openInvoiceId, updatedAt: now() });
    tx.update(attendanceRef, { units, note, updatedAt: now() });
    audit(tx, db, actor, 'adjust', account.id, { attendanceId: id, before: attendance.units, after: units, note, remaining });
  });
}
export async function createInvoice(studentId: unknown, actor: string) {
  const db = database(); const id = key(studentId); const invoiceId = randomUUID();
  await db.runTransaction(async tx => {
    const ref = db.doc(`opsAccounts/${id}`); const account = (await tx.get(ref)).data() as Account | undefined;
    if (!account?.active) throw new Error('수강 설정을 먼저 저장해주세요.');
    if (account.openInvoiceId) throw new Error('아직 완료하지 않은 청구가 있습니다.');
    newInvoice(tx, db, account, invoiceId, '원장 등록');
    tx.update(ref, { openInvoiceId: invoiceId, updatedAt: now() }); audit(tx, db, actor, 'invoice', id, { invoiceId });
  });
}
export async function payment(input: Record<string, unknown>, actor: string) {
  const db = database(); const id = key(input.invoiceId); const requestId = key(input.requestId); const method = text(input.method, 30);
  if (!(METHODS as readonly string[]).includes(method)) throw new Error('결제 수단을 선택해주세요.');
  const paymentRef = db.doc(`opsPayments/${requestId}`);
  await db.runTransaction(async tx => {
    const invoiceRef = db.doc(`opsInvoices/${id}`);
    const [existing, snap] = await Promise.all([tx.get(paymentRef), tx.get(invoiceRef)]);
    if (existing.exists) {
      if (existing.data()?.invoiceId !== id || existing.data()?.amount !== input.amount || existing.data()?.method !== method) throw new Error('중복 요청 내용이 다릅니다.');
      return;
    }
    const invoice = snap.data() as Invoice | undefined; if (!invoice) throw new Error('청구를 찾을 수 없습니다.');
    const accountRef = db.doc(`opsAccounts/${invoice.studentId}`); const account = (await tx.get(accountRef)).data() as Account;
    const { paid, complete } = settle(invoice, input.amount as number);
    tx.create(paymentRef, { id: requestId, invoiceId: id, studentId: invoice.studentId, amount: input.amount, method, at: now(), note: text(input.note), actor });
    tx.update(invoiceRef, { paid, status: complete ? 'paid' : 'open' });
    if (complete) tx.update(accountRef, { remaining: account.remaining + invoice.units, openInvoiceId: account.openInvoiceId === id ? null : account.openInvoiceId, updatedAt: now() });
    audit(tx, db, actor, 'payment', invoice.studentId, { invoiceId: id, amount: input.amount, method, complete });
  });
}
export async function invoiceAction(input: Record<string, unknown>, actor: string) {
  const db = database(); const id = key(input.invoiceId);
  await db.runTransaction(async tx => {
    const ref = db.doc(`opsInvoices/${id}`); const invoice = (await tx.get(ref)).data() as Invoice | undefined;
    if (!invoice || invoice.status !== 'open') throw new Error('진행 중인 청구가 아닙니다.');
    const accountRef = db.doc(`opsAccounts/${invoice.studentId}`); const account = (await tx.get(accountRef)).data() as Account;
    const noticeRef = db.doc(`opsNotices/billing_${id}`); const notice = await tx.get(noticeRef);
    if (input.action === 'cancelInvoice') {
      if (invoice.paid !== 0) throw new Error('수납된 청구는 취소할 수 없습니다.');
      if (notice.data()?.status === 'processing') throw new Error('발송 처리 중입니다. 잠시 후 확인해주세요.');
      tx.update(ref, { status: 'cancelled' });
      if (account.openInvoiceId === id) tx.update(accountRef, { openInvoiceId: null });
      if (notice.exists && ['queued', 'blocked', 'failed'].includes(notice.data()?.status)) tx.update(noticeRef, { status: 'cancelled' });
    } else if (input.action === 'confirmInvoice') {
      tx.update(ref, { needsReview: false });
      if (notice.data()?.status === 'review') tx.update(noticeRef, { status: 'queued', error: '' });
    } else {
      if (invoice.needsReview) throw new Error('횟수 수정에 따른 청구 내용을 먼저 확인해주세요.');
      if (notice.exists) throw new Error('이미 발송 대기 또는 처리 기록이 있습니다.');
      enqueue(tx, db, `billing_${id}`, account, 'billing', { student_name: account.name, amount: String(invoice.amount - invoice.paid), lesson_count: String(invoice.units) });
    }
    audit(tx, db, actor, String(input.action), invoice.studentId, { invoiceId: id });
  });
}
export async function issuePair(actor: string) {
  const db = database(); const code = randomBytes(16).toString('hex');
  await db.doc(`opsPairing/${hash(code)}`).set({ actor, expiresAt: Date.now() + 10 * 60000, used: false });
  return { code };
}
export async function pair(code: unknown) {
  if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) throw new Error('등록 코드를 확인해주세요.');
  const db = database(); const token = randomBytes(32).toString('hex'); const id = hash(token);
  await db.runTransaction(async tx => {
    const ref = db.doc(`opsPairing/${hash(code)}`); const data = (await tx.get(ref)).data();
    if (!data || data.used || data.expiresAt < Date.now()) throw new Error('코드가 만료되었습니다. 새 코드를 만들어주세요.');
    tx.update(ref, { used: true });
    tx.create(db.doc(`opsDevices/${id}`), { id, name: '출석 아이폰', active: true, createdAt: now(), expiresAt: Date.now() + 90 * 86400000, actor: data.actor });
  });
  return token;
}
export async function revoke(id: unknown) { await database().doc(`opsDevices/${key(id)}`).update({ active: false }); }

export async function releaseBlocked(actor: string) {
  const db = database();
  const blocked = await db.collection('opsNotices').where('status', '==', 'blocked').limit(100).get();
  for (const item of blocked.docs) await db.runTransaction(async tx => {
    const fresh = await tx.get(item.ref);
    if (fresh.data()?.status !== 'blocked') return;
    tx.update(item.ref, { status: 'queued', error: '' });
    audit(tx, db, actor, 'notice-config-retry', fresh.data()!.studentId, { noticeId: item.id });
  });
}

// Manual records never send an arrival notification. Absolute units and revision
// checks prevent a retry or another open tab from deducting twice.
export async function recordAttendance(input: Record<string, unknown>, actor: string) {
  const values = attendanceInput(input); const studentId = key(input.studentId);
  const db = database(); const id = `${studentId}_${values.day}`; const invoiceId = randomUUID();
  return db.runTransaction(async tx => {
    const ref = db.doc(`opsAttendance/${id}`); const accountRef = db.doc(`opsAccounts/${studentId}`);
    const [previous, accountSnap] = await Promise.all([tx.get(ref), tx.get(accountRef)]);
    const old = previous.data() as Attendance | undefined; const account = accountSnap.data() as Account | undefined;
    if (!account) throw new Error('먼저 수강 설정을 저장해주세요.');
    const currentInvoice = account.openInvoiceId ? await tx.get(db.doc(`opsInvoices/${account.openInvoiceId}`)) : null;
    if (old && Object.entries(values).every(([k,v]) => (old as unknown as Record<string, unknown>)[k] === v)) return { attendance:[old], accounts:[account], invoices: currentInvoice?.exists ? [{...currentInvoice.data(),id:currentInvoice.id} as Invoice] : [] };
    if ((old?.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw new Error('다른 화면에서 기록이 변경됐습니다. 새로고침 후 다시 확인해주세요.');

    const stamp=now();
    const remaining = adjustBalance(account.remaining, old?.units || 0, values.units);
    const openInvoiceId = remaining <= 0 && values.units > (old?.units || 0) && !account.openInvoiceId ? newInvoice(tx, db, account, invoiceId, '수동 출결 기록 후 소진', stamp) : account.openInvoiceId;
    if (remaining > 0 && currentInvoice?.exists) tx.update(currentInvoice.ref, { needsReview: true });
    const attendance:Attendance={ ...old, ...values, id, studentId, name: account.name, source: old?.source || 'manual', at: old?.at || stamp, updatedAt: stamp };
    const updatedAccount={...account,remaining,openInvoiceId,updatedAt:stamp};
    tx.set(ref, attendance);
    tx.update(accountRef, { remaining, openInvoiceId, updatedAt: stamp });
    audit(tx, db, actor, 'record-attendance', studentId, { attendanceId: id, before: old?.units || 0, ...values, remaining });
    const invoices:Invoice[]=openInvoiceId && openInvoiceId!==account.openInvoiceId ? [{id:openInvoiceId,studentId:account.id,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:stamp}] : currentInvoice?.exists ? [{...currentInvoice.data(),id:currentInvoice.id,...(remaining>0?{needsReview:true}:{})} as Invoice] : [];
    return { attendance:[attendance], accounts:[updatedAccount], invoices };
  });
}
