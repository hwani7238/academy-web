import { database, manager, sameOrigin, failure } from '@/lib/operations/auth';
import * as service from '@/lib/operations/service';
import { noticeConfigured, processNotices } from '@/lib/operations/notices';
import { seoulDay, validDay } from '@/lib/operations/model';
import { after } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await manager(request); const db = database();
    const day = new URL(request.url).searchParams.get('day') || seoulDay();
    validDay(day);
    const month = day.slice(0, 7); const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
    const [students, accounts, attendance, invoices, payments, notices, devices] = await Promise.all([
      db.collection('students').get(), db.collection('opsAccounts').get(),
      db.collection('opsAttendance').where('day', '>=', `${month}-01`).where('day', '<', end.toISOString().slice(0, 10)).get(),
      db.collection('opsInvoices').where('status', '==', 'open').get(),
      db.collection('opsPayments').orderBy('at', 'desc').limit(100).get(),
      db.collection('opsNotices').orderBy('createdAt', 'desc').limit(50).get(), db.collection('opsDevices').get(),
    ]);
    const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map(d => ({ ...d.data(), id: d.id }));
    return Response.json({ day, configured: noticeConfigured(), students: students.docs.flatMap(d => {
      const raw = d.data(); const base = { name: raw.name || '학생', phone: raw.phone || '' };
      // Preserve existing single-account balances; do not silently duplicate them.
      if (accounts.docs.some(a => a.id === d.id)) return [{ ...base, id: d.id, instruments: service.studentSubjects(raw) }];
      const subjects = service.studentSubjects(raw);
      if (!subjects.length) return [{ ...base, id: d.id, instruments: [] }];
      const known = accounts.docs.filter(a => a.data().sourceStudentId === d.id).map(a => a.data().subject as string);
      return [...new Set([...subjects, ...known])].map(subject => ({ ...base, id: service.enrollmentId(d.id, subject), sourceStudentId: d.id, subject, name: `${base.name} · ${subject}`, instruments: [subject] }));
    }), accounts: rows(accounts), attendance: rows(attendance), invoices: rows(invoices), payments: rows(payments), notices: notices.docs.map(d => { const n = d.data(); return { id: d.id, studentId: n.studentId, name: n.name, kind: n.kind, status: n.status, createdAt: n.createdAt, requestId: n.requestId || '', error: n.error || '' }; }), devices: devices.docs.map(d => { const v = d.data(); return { id: d.id, name: v.name, active: v.active && v.expiresAt > Date.now(), createdAt: v.createdAt }; }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const actor = await manager(request); const input = await request.json();
    switch (input.action) {
      case 'configure': await service.configure(input, actor); break;
      case 'recordAttendance': await service.recordAttendance(input, actor); break;
      case 'adjust': await service.adjust(input, actor); break;
      case 'invoice': await service.createInvoice(input.studentId, actor); break;
      case 'payment': await service.payment(input, actor); break;
      case 'sendInvoice': case 'cancelInvoice': case 'confirmInvoice': await service.invoiceAction(input, actor); break;
      case 'pair': return Response.json(await service.issuePair(actor));
      case 'revoke': await service.revoke(input.deviceId); break;
      case 'releaseBlocked': await service.releaseBlocked(actor); break;
      case 'process': return Response.json(await processNotices());
      default: throw new Error('지원하지 않는 작업입니다.');
    }
    after(async () => { try { await processNotices(); } catch { console.error('Notification worker failed; pending records retained.'); } });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
