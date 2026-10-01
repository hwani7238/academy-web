import { reviewBalance, type BalanceAudit, type BalanceSource } from './balance-review';
import { changeSchedule, moveLesson } from './schedule';
import { attendanceDays, rangeAttendance } from './attendance-range';
import { enrollmentState, lifecycleInput, courseLifecycle, deleteOrRestoreEnrollment } from './lifecycle';
import { checkInName, courseGroup, resolveImportedSubjects } from './course-label';
export { resolveImportedSubjects } from './course-label';
import { correctedArrival } from './attendance-time';
import { randomUUID, randomBytes } from 'node:crypto';
import { REGISTRATION_SUBJECTS, registrationInput } from './registration';
import type { Transaction, Firestore } from 'firebase-admin/firestore';
import { database, hash, HttpError } from './auth';
import { Account, Invoice, Attendance, integer, adjustBalance, settle, suffixes, seoulDay, METHODS, validDay, attendanceInput } from './model';

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
  const id = key(input.sourceStudentId); const studentId=key(input.studentId); const values = lifecycleInput(input); const db = database();
  return db.runTransaction(async tx => {
    const ref = db.doc(`students/${id}`); const student = (await tx.get(ref)).data();
    if (!student) throw Error('학생을 찾을 수 없습니다.');
    const account=(await tx.get(db.doc(`opsAccounts/${studentId}`))).data();
    const subjects=studentSubjects(student);
    if(studentId===id){if(subjects.length>1)throw Error('과목별 수강권을 먼저 분리해주세요.');}
    else if(!subjects.some(subject=>enrollmentId(id,subject)===studentId) && !(account?.sourceStudentId===id))throw Error('해당 학생의 과목을 찾을 수 없습니다.');
    const old = courseLifecycle(student,studentId);
    if (old?.deletedAt) throw Error('삭제된 항목에서 먼저 복원해주세요.');
    if (old && old.status === values.status && old.until === values.until && (old.withdrawnOn || '') === values.withdrawnOn && old.note === values.note) return { lifecycle: { studentId, value:old } };
    if ((old?.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw Error('학생 상태가 변경됐습니다. 새로고침 후 다시 확인해주세요.');
    const value = { ...values, updatedAt: new Date(Math.max(Date.now(),Date.parse(old?.updatedAt||'')+1||0)).toISOString() };
    tx.update(ref, { courseLifecycles: {...student.courseLifecycles,[studentId]:value} });
    audit(tx, db, actor, 'course-lifecycle', studentId, { sourceStudentId:id, before: old || null, ...values });
    return { lifecycle: { studentId, value } };
  });
}
export async function deleteEnrollment(input: Record<string, unknown>, actor: string) {
  const id = key(input.sourceStudentId), studentId = key(input.studentId), db = database();
  return db.runTransaction(async tx => {
    const ref = db.doc(`students/${id}`), student = (await tx.get(ref)).data();
    if (!student) throw Error('학생을 찾을 수 없습니다.');
    const account = (await tx.get(db.doc(`opsAccounts/${studentId}`))).data();
    const subjects = studentSubjects(student);
    if (studentId === id) {
      if (subjects.length > 1) throw Error('과목별 수강권을 먼저 분리해주세요.');
    } else if (!subjects.some(subject => enrollmentId(id, subject) === studentId) && account?.sourceStudentId !== id) {
      throw Error('해당 학생의 과목을 찾을 수 없습니다.');
    }
    const old = courseLifecycle(student, studentId);
    const stamp = new Date(Math.max(Date.now(), Date.parse(old?.updatedAt || '') + 1 || 0)).toISOString();
    const value = deleteOrRestoreEnrollment(old, input, stamp);
    // Keep attendance, payments, outstanding invoices and other courses intact.
    tx.update(ref, { courseLifecycles: { ...student.courseLifecycles, [studentId]: value } });
    audit(tx, db, actor, input.action === 'restoreEnrollment' ? 'restore-enrollment' : 'delete-enrollment', studentId, { sourceStudentId: id, before: old, after: value });
    return { lifecycle: { studentId, value } };
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
  return db.runTransaction(async tx => {
    const [existing, student] = await Promise.all([tx.get(ref), tx.get(db.doc(`students/${sourceStudentId}`))]);
    if (!student.exists) throw new Error('학생을 찾을 수 없습니다.');
    if (subject && !studentSubjects(student.data() || {}).includes(subject)) throw new Error('등록된 과목을 확인해주세요.');
    if (subject && (await tx.get(db.doc(`opsAccounts/${sourceStudentId}`))).exists) throw new Error('기존 통합 수강권을 과목별로 분리한 후 등록해주세요.');
    const old = existing.data();
    const overrideGroup=student.data()?.operationsCourseGroups?.[subject] as string|undefined;
    const overrideSubject=overrideGroup?(overrideGroup.includes('피아노')?'피아노':overrideGroup):undefined;
    const remaining = old ? old.remaining : integer(input.remaining, -1000, 1000, '현재 남은 횟수');
    const saved = { id, ...(old?.schedule ? {schedule:old.schedule} : {}), ...(old?.importId ? { importId: old.importId, openingAsOf: old.openingAsOf } : {}), ...(old?.attendanceGroup ? { attendanceGroup: old.attendanceGroup } : {}), ...(old?.displaySubject ? { displaySubject: old.displaySubject } : {}), ...(subject ? { sourceStudentId, subject } : {}), name: subject ? `${student.data()?.name || '학생'} · ${subject}` : student.data()?.name || '학생', phone, checkinSuffixes: codes, planUnits, planAmount, remaining, openInvoiceId: old?.openInvoiceId || null, active: input.active !== false, autoBilling: input.autoBilling === true, updatedAt: now(), ...(overrideGroup?{attendanceGroup:overrideGroup,displaySubject:overrideSubject,name:`${student.data()?.name} · ${overrideSubject}`}:{}) };
    tx.set(ref, saved);
    audit(tx, db, actor, 'configure', id, { planUnits, planAmount, remaining, active: input.active !== false, autoBilling: input.autoBilling === true });
    // A changed plan length also changes historical sequence positions.
    // Let that case rebuild the chronology; fee/contact edits need only this row.
    return old && old.planUnits === planUnits ? { accounts: [saved as Account] } : undefined;
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
    if (!owner || enrollmentState(courseLifecycle(owner,id)) !== 'active') throw new HttpError(409, '휴원·퇴원 상태입니다. 선생님께 복귀 처리를 요청해주세요.');
    const imported = account.importId ? (await tx.get(db.doc(`opsImports/${account.importId}`))).data() : undefined;
    const sources = courseGroup(account, owner) ? [] : (await tx.get(db.collection('opsImports').where('matchedStudentId', '==', account.sourceStudentId || id))).docs.map(d => d.data());
    const name = checkInName(account, owner, sources);
    if (!attended.exists && account.importId && account.openingAsOf === day) {
      if (imported?.history?.some((h: { cells?: { day: string }[] }) => h.cells?.some(c => c.day === day))) {
        return { duplicate: true, name };
      }
    }
    if (attended.exists && attended.data()?.status !== 'cancelled') {
      const status = attended.data()?.status || 'present';
      if (status !== 'present' && status !== 'makeup') throw new HttpError(409, '오늘 결석·취소 기록이 있습니다. 선생님께 출석 변경을 요청해주세요.');
      return { duplicate: true, name };
    }
    const previousNotice = attended.exists ? await tx.get(db.doc(`opsNotices/attendance_${attendanceId}`)) : null;
    const remaining = adjustBalance(account.remaining, 0, 1);
    const openInvoiceId = remaining <= 0 && !account.openInvoiceId ? newInvoice(tx, db, account, invoiceId, '수업 횟수 소진') : account.openInvoiceId;
    tx.set(attendanceRef, { id: attendanceId, studentId: id, name: account.name, day, at: now(), units: 1, status: 'present', source: 'kiosk', note: '', updatedAt: now() });
    tx.update(ref, { remaining, openInvoiceId, updatedAt: now() });
    if (!previousNotice?.exists) enqueue(tx, db, `attendance_${attendanceId}`, account, 'attendance', { student_name: account.name, attendance_time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) });
    audit(tx, db, actor, 'check-in', id, { attendanceId, units: 1, remaining });
    return { duplicate: false, name };
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
export async function correctAttendanceTime(input: Record<string, unknown>, actor: string) {
  const id = key(input.attendanceId), db = database();
  return db.runTransaction(async tx => {
    const ref = db.doc(`opsAttendance/${id}`);
    const old = (await tx.get(ref)).data() as Attendance | undefined;
    if (!old) throw Error('출석 기록을 찾을 수 없습니다.');
    const arrivalAt = correctedArrival(old.day, input.time);
    if (old.arrivalAt === arrivalAt) return { attendance: [old] };
    if (old.updatedAt !== input.expectedUpdatedAt) throw Error('다른 화면에서 기록이 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    const updatedAt = now();
    tx.update(ref, { arrivalAt, updatedAt });
    audit(tx, db, actor, 'correct-attendance-time', old.studentId, { attendanceId: id, before: old.arrivalAt || old.at, after: arrivalAt, source: old.source || 'kiosk' });
    return { attendance: [{ ...old, arrivalAt, updatedAt }] };
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
    if ((invoice.updatedAt || '') !== (input.expectedInvoiceUpdatedAt || '')) throw new Error('청구 내용이 변경됐습니다. 창을 닫고 다시 수납해주세요.');
    const accountRef = db.doc(`opsAccounts/${invoice.studentId}`); const account = (await tx.get(accountRef)).data() as Account;
    const { paid, complete } = settle(invoice, input.amount as number);
    tx.create(paymentRef, { id: requestId, invoiceId: id, studentId: invoice.studentId, amount: input.amount, method, at: now(), note: text(input.note), actor });
    tx.update(invoiceRef, { paid, status: complete ? 'paid' : 'open' });
    if (complete) tx.update(accountRef, { remaining: account.remaining + (invoice.creditUnits ?? invoice.units), openInvoiceId: account.openInvoiceId === id ? null : account.openInvoiceId, updatedAt: now() });
    audit(tx, db, actor, 'payment', invoice.studentId, { invoiceId: id, amount: input.amount, method, complete });
  });
}
export async function editInvoice(input: Record<string, unknown>, actor: string) {
  const id = key(input.invoiceId), db = database();
  const units = integer(input.units, 1, 200, '수강 횟수');
  const amount = integer(input.amount, 1, 100000000, '청구 금액');
  if (!['next', 'current'].includes(String(input.kind))) throw Error('횟수 반영 방법을 선택해주세요.');
  const cycleStart = input.kind === 'current' ? validDay(input.cycleStart) : '';
  if (cycleStart > seoulDay()) throw Error('재등록일은 오늘 또는 이전 날짜로 입력해주세요.');
  await db.runTransaction(async tx => {
    const ref = db.doc(`opsInvoices/${id}`), old = (await tx.get(ref)).data() as Invoice | undefined;
    if (!old || old.status !== 'open' || old.paid !== 0) throw Error('아직 수납하지 않은 청구만 수정할 수 있습니다.');
    if ((old.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw Error('청구 내용이 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    const account = (await tx.get(db.doc(`opsAccounts/${old.studentId}`))).data() as Account | undefined;
    if (!account || account.openInvoiceId !== id) throw Error('현재 청구 연결을 확인해주세요.');
    const noticeRef = db.doc(`opsNotices/billing_${id}`), notice = (await tx.get(noticeRef)).data();
    if (notice && !['queued', 'blocked', 'review', 'cancelled'].includes(notice.status)) throw Error('결제 안내 처리 기록이 있어 수정할 수 없습니다. 발송 결과를 먼저 확인해주세요.');
    const creditUnits = input.kind === 'current' ? 0 : units;
    if (cycleStart) {
      const cycles = await tx.get(db.collection('opsInvoices').where('studentId', '==', old.studentId));
      if (cycles.docs.some(d => d.id !== id && d.data().status !== 'cancelled' && d.data().cycleStart === cycleStart)) throw Error('이 재등록일의 청구가 이미 있습니다. 기존 청구를 확인해주세요.');
    }
    if (old.units === units && old.amount === amount && (old.creditUnits ?? old.units) === creditUnits && (old.cycleStart || '') === cycleStart && !old.needsReview) return;
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(old.updatedAt || '') + 1 || 0)).toISOString();
    tx.update(ref, { units, amount, creditUnits, cycleStart, needsReview: false, updatedAt });
    if (notice && notice.status !== 'cancelled') tx.update(noticeRef, { parameters: { ...notice.parameters, amount: String(amount), lesson_count: String(units) } });
    audit(tx, db, actor, 'edit-invoice', old.studentId, {
      invoiceId: id, before: { units: old.units, amount: old.amount, creditUnits: old.creditUnits ?? old.units, cycleStart: old.cycleStart || '' },
      after: { units, amount, creditUnits, cycleStart }, remaining: account.remaining, note: text(input.note),
    });
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

// A whole date range is validated before any writes; marking leave never changes balances.
export async function recordAttendanceRange(input:Record<string,unknown>,actor:string) {
 const studentId=key(input.studentId),days=attendanceDays(input.start,input.end),db=database();
 return db.runTransaction(async tx=>{
  const account=(await tx.get(db.doc(`opsAccounts/${studentId}`))).data() as Account|undefined;
  if(!account)throw Error('먼저 수강 설정을 저장해주세요.');
  const [records,imports]=await Promise.all([
   Promise.all(days.map(day=>tx.get(db.doc(`opsAttendance/${studentId}_${day}`)))),
   tx.get(db.collection('opsImports').where('matchedStudentId','==',account.sourceStudentId || studentId)),
  ]);
  const legacyDays=new Set<string>();
  for(const doc of imports.docs){
   const source=doc.data();
   if(doc.id!==account.importId && (!account.subject || !resolveImportedSubjects([account.subject],source.subject).length))continue;
   for(const history of source.history || [])for(const cell of history.cells || []){
    if(typeof cell.day==='string' && days.includes(cell.day) && cell.day<=(source.attendanceCutoffs?.[cell.day.slice(0,7)] || source.asOf))legacyDays.add(cell.day);
   }
  }
  const previous=records.filter(d=>d.exists).map(d=>d.data() as Attendance);
  const attendance=rangeAttendance(input,account,previous,legacyDays,now());
  for(const row of attendance)tx.set(db.doc(`opsAttendance/${row.id}`),row);
  if(attendance.length)audit(tx,db,actor,'attendance-range',studentId,{start:input.start,end:input.end,status:input.status,rangeId:input.rangeId,days:attendance.map(r=>r.day),before:previous});
  return {attendance:attendance.length?attendance:previous};
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
    delete attendance.range;
    const updatedAccount={...account,remaining,openInvoiceId,updatedAt:stamp};
    tx.set(ref, attendance);
    tx.update(accountRef, { remaining, openInvoiceId, updatedAt: stamp });
    audit(tx, db, actor, 'record-attendance', studentId, { attendanceId: id, before: old?.units || 0, ...values, remaining });
    const invoices:Invoice[]=openInvoiceId && openInvoiceId!==account.openInvoiceId ? [{id:openInvoiceId,studentId:account.id,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:stamp}] : currentInvoice?.exists ? [{...currentInvoice.data(),id:currentInvoice.id,...(remaining>0?{needsReview:true}:{})} as Invoice] : [];
    return { attendance:[attendance], accounts:[updatedAccount], invoices };
  });
}

// Absolute balance correction, separate from attendance and payment records.
export async function correctRemaining(input: Record<string, unknown>, actor: string) {
  const studentId=key(input.studentId), requestId=key(input.requestId);
  const remaining=integer(input.remaining,-1000,1000,'남은 횟수'), note=text(input.note);
  const db=database(), ref=db.doc(`opsAccounts/${studentId}`);
  const auditRef=db.doc(`opsAudit/balance_${requestId}`);
  const digest=hash(JSON.stringify([studentId,remaining,note]));
  return db.runTransaction(async tx=>{
    const [accountSnap, previous]=await Promise.all([tx.get(ref),tx.get(auditRef)]);
    const account=accountSnap.data() as Account|undefined;
    if(!account)throw Error('먼저 수강 등록을 해주세요.');
    const invoiceSnap=account.openInvoiceId?await tx.get(db.doc(`opsInvoices/${account.openInvoiceId}`)):null;
    if(previous.exists){
      if(previous.data()?.digest!==digest)throw Error('이미 처리한 요청과 내용이 다릅니다.');
      return {accounts:[account],invoices:invoiceSnap?.exists?[invoiceSnap.data() as Invoice]:[]};
    }
    if(account.updatedAt!==input.expectedUpdatedAt || account.remaining!==input.expectedRemaining)throw Error('다른 화면에서 잔여 횟수가 변경됐습니다. 새로고침 후 다시 수정해주세요.');
    if(input.reconciliationFingerprint){
      const [source,original,events,records,invoices]=await Promise.all([
        account.importId?tx.get(db.doc(`opsImports/${account.importId}`)):Promise.resolve(null),
        account.importId?tx.get(db.doc(`opsImports/${account.importId}/revisions/1`)):Promise.resolve(null),
        tx.get(db.collection('opsAudit').where('studentId','==',studentId)),
        tx.get(db.collection('opsAttendance').where('studentId','==',studentId)),
        tx.get(db.collection('opsInvoices').where('studentId','==',studentId)),
      ]);
      const report=reviewBalance(account,source?.exists?{...source.data(),id:source.id,...(original?.exists?{openingHistory:original.data()?.history}:{})} as BalanceSource:undefined,events.docs.map(d=>({...d.data(),id:d.id}) as BalanceAudit),records.docs.map(d=>({...d.data(),id:d.id}) as Attendance),invoices.docs.map(d=>({...d.data(),id:d.id}) as Invoice));
      if(report.fingerprint!==input.reconciliationFingerprint || report.status!=='correct' || report.expected!==remaining)throw Error('점검 이후 근거가 변경됐습니다. 다시 점검해주세요.');
    }

    const at=new Date(Math.max(Date.now(),Date.parse(account.updatedAt)+1)).toISOString();
    let invoice=invoiceSnap?.data() as Invoice|undefined;
    let openInvoiceId=account.openInvoiceId;
    if(remaining<=0 && !openInvoiceId){
      openInvoiceId=newInvoice(tx,db,{...account,autoBilling:false},randomUUID(),'잔여 횟수 정정 후 소진',at);
      invoice={id:openInvoiceId,studentId,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:at};
    }else if(remaining!==account.remaining && invoice?.status==='open'){
      invoice={...invoice,needsReview:true};tx.update(invoiceSnap!.ref,{needsReview:true});
    }
    const updated={...account,remaining,openInvoiceId,updatedAt:at};
    tx.update(ref,{remaining,openInvoiceId,updatedAt:at});
    tx.create(auditRef,{actor,action:'correct-remaining',studentId,digest,detail:{before:account.remaining,after:remaining,note},at});
    return {accounts:[updated],invoices:invoice?[invoice]:[]};
  });
}

export async function createCurrentCycleInvoice(input:Record<string,unknown>,actor:string){
 const id=key(input.studentId),cycleStart=validDay(input.cycleStart);
 if(cycleStart>seoulDay())throw Error('재등록일은 오늘 또는 이전 날짜로 입력해주세요.');
 const db=database(),invoiceId=`cycle_${hash(JSON.stringify([id,cycleStart]))}`;
 return db.runTransaction(async tx=>{
  const ref=db.doc(`opsAccounts/${id}`),invoiceRef=db.doc(`opsInvoices/${invoiceId}`);
  const [a,old]=await Promise.all([tx.get(ref),tx.get(invoiceRef)]);const account=a.data() as Account|undefined;
  if(!account?.active)throw Error('수강 설정을 먼저 저장해주세요.');
  if(old.exists)throw Error('이 재등록일의 청구가 이미 있습니다. 기존 청구를 확인해주세요.');
  const cycles=await tx.get(db.collection('opsInvoices').where('studentId','==',id));
  if(cycles.docs.some(d=>d.data().status!=='cancelled' && d.data().cycleStart===cycleStart))throw Error('이 재등록일의 청구가 이미 있습니다. 기존 청구를 확인해주세요.');
  if(account.openInvoiceId)throw Error('진행 중인 청구가 있습니다. 기존 청구를 확인해주세요.');
  if(account.updatedAt!==input.expectedUpdatedAt)throw Error('수강 정보가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
  const at=now();const invoice:Invoice={id:invoiceId,studentId:id,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:at,creditUnits:0,cycleStart};
  tx.create(invoiceRef,invoice);tx.update(ref,{openInvoiceId:invoiceId,updatedAt:at});
  audit(tx,db,actor,'current-cycle-invoice',id,{invoiceId,cycleStart,amount:invoice.amount,remaining:account.remaining,creditUnits:0});
  return {accounts:[{...account,openInvoiceId:invoiceId,updatedAt:at}],invoices:[invoice]};
 });
}

// Keep enrollment IDs stable so past attendance, payments and balances stay linked.
export async function renameStudent(input:Record<string,unknown>,actor:string){
 const sourceStudentId=key(input.sourceStudentId),id=key(input.studentId),db=database();
 const name=typeof input.name==='string'?input.name.trim():'';
 if(!name||name.length>100||/[\r\n\u0000]/.test(name))throw Error('학생 이름을 1~100자로 입력해주세요.');
 await db.runTransaction(async tx=>{
  const studentRef=db.doc(`students/${sourceStudentId}`);
  const [studentSnap,accounts,legacy]=await Promise.all([
   tx.get(studentRef),tx.get(db.collection('opsAccounts').where('sourceStudentId','==',sourceStudentId)),tx.get(db.doc(`opsAccounts/${sourceStudentId}`)),
  ]);
  const student=studentSnap.data();if(!student)throw Error('학생을 찾을 수 없습니다.');
  if(id!==sourceStudentId&&!studentSubjects(student).some(s=>enrollmentId(sourceStudentId,s)===id)&&!accounts.docs.some(d=>d.id===id))throw Error('해당 학생의 수강 정보를 찾을 수 없습니다.');
  if(student.name===name)return;
  if(student.name!==input.expectedName||(student.courseUpdatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('학생 정보가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
  const at=now();
  tx.update(studentRef,{name,courseUpdatedAt:at});
  const accountDocs=new Map<string,FirebaseFirestore.DocumentSnapshot>(accounts.docs.map(d=>[d.id,d]));if(legacy.exists)accountDocs.set(legacy.id,legacy);
  for(const account of accountDocs.values()){
   const suffix=String(account.data()?.name||'').split(' · ').slice(1).join(' · ');
   tx.update(account.ref,{name:suffix?`${name} · ${suffix}`:name,updatedAt:at});
  }
  audit(tx,db,actor,'rename-student',sourceStudentId,{before:student.name,after:name,accountIds:[...accountDocs.keys()]});
 });
}

export async function manageCourse(input:Record<string,unknown>,actor:string){
 const sourceStudentId=key(input.sourceStudentId),id=key(input.studentId),group=text(input.group,80),subject=text(input.subject,80);
 if(!REGISTRATION_SUBJECTS.includes(group)||!['add','change'].includes(String(input.mode)))throw Error('과목과 변경 방법을 선택해주세요.');
 const canonical=(v:string)=>v.includes('피아노')?'피아노':v;
 const displaySubject=canonical(group),db=database();
 await db.runTransaction(async tx=>{
  const studentRef=db.doc(`students/${sourceStudentId}`),ref=db.doc(`opsAccounts/${id}`);
  const [studentSnap,accountSnap,legacy]=await Promise.all([tx.get(studentRef),tx.get(ref),tx.get(db.doc(`opsAccounts/${sourceStudentId}`))]);
  const student=studentSnap.data(),account=accountSnap.data();if(!student)throw Error('학생을 찾을 수 없습니다.');
  const subjects=studentSubjects(student),groups=student.operationsCourseGroups||{};
  if(legacy.exists)throw Error('통합 수강권은 과목별 분리 확인이 필요합니다.');
  if(id!==enrollmentId(sourceStudentId,subject)||!subjects.includes(subject))throw Error('학생의 과목 정보를 확인해주세요.');
  if((student.courseUpdatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('과목 정보가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
  if(subjects.some(s=>(input.mode==='add'||s!==subject)&&canonical(groups[s]||s)===displaySubject))throw Error('이미 등록된 과목입니다. 해당 과목에서 반을 변경해주세요.');
  const at=now();
  if(input.mode==='add'){
   if(subjects.includes(displaySubject))throw Error('기존 과목 기록이 있어 같은 과목을 추가할 수 없습니다.');
   tx.update(studentRef,{instruments:[...subjects,displaySubject],operationsCourseGroups:{...groups,[displaySubject]:group},courseUpdatedAt:at});
  }else{
   tx.update(studentRef,{operationsCourseGroups:{...groups,[subject]:group},courseUpdatedAt:at});
   if(account)tx.update(ref,{attendanceGroup:group,displaySubject,name:`${student.name} · ${displaySubject}`,updatedAt:at});
  }
  audit(tx,db,actor,'manage-course',id,{mode:input.mode,subject,before:groups[subject]||subject,group});
 });
}

// Schedule edits never change attendance, balances, invoices or notifications.
export async function saveSchedule(input: Record<string, unknown>, actor: string) {
 const id=key(input.studentId),db=database(),ref=db.doc(`opsAccounts/${id}`);
 return db.runTransaction(async tx=>{
  const account=(await tx.get(ref)).data() as Account|undefined;
  if(!account)throw Error('먼저 수강 등록을 완료해주세요.');
  const stamp=new Date(Math.max(Date.now(),Date.parse(account.schedule?.updatedAt||'')+1||0)).toISOString();
  let schedule;
  if(input.action==='moveLesson'){
   const from=validDay(input.from),to=validDay(input.to);
   const records=(await Promise.all([from,to].map(day=>tx.get(db.doc(`opsAttendance/${id}_${day}`))))).filter(d=>d.exists).map(d=>d.data() as Attendance);
   const imports=await tx.get(db.collection('opsImports').where('matchedStudentId','==',account.sourceStudentId||id));
   for(const doc of imports.docs){const source=doc.data();
    if(doc.id!==account.importId && (!account.subject || !resolveImportedSubjects([account.subject],source.subject).length))continue;
    for(const history of source.history||[])for(const cell of history.cells||[]){
     if([from,to].includes(cell.day) && cell.day<=(source.attendanceCutoffs?.[cell.day.slice(0,7)]||source.asOf) && !records.some(r=>r.day===cell.day && r.status==='cancelled'))throw Error('이전 장부 기록이 있는 날짜는 옮길 수 없습니다.');
    }
   }
   schedule=moveLesson(account.schedule,input,records,stamp);
  }else schedule=changeSchedule(account.schedule,input,stamp);
  tx.update(ref,{schedule});
  audit(tx,db,actor,input.action==='moveLesson'?'move-lesson':'lesson-schedule',id,{before:account.schedule||null,after:schedule});
  return {accounts:[{...account,id,schedule}]};
 });
}
