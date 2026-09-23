import { database, manager, sameOrigin, failure } from '@/lib/operations/auth';
import * as service from '@/lib/operations/service';
import { noticeConfigured, processNotices } from '@/lib/operations/notices';
import { seoulDay, validDay, type Snapshot } from '@/lib/operations/model';
import { after } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await manager(request); const db = database();
    const day = new URL(request.url).searchParams.get('day') || seoulDay();
    validDay(day);
    const month = day.slice(0, 7); const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
    const [students, accounts, attendance, invoices, payments, notices, devices, imports] = await Promise.all([
      db.collection('students').get(), db.collection('opsAccounts').get(),
      db.collection('opsAttendance').where('day', '>=', `${month}-01`).where('day', '<', end.toISOString().slice(0, 10)).get(),
      db.collection('opsInvoices').where('status', '==', 'open').get(),
      db.collection('opsPayments').orderBy('at', 'desc').limit(100).get(),
      db.collection('opsNotices').orderBy('createdAt', 'desc').limit(50).get(), db.collection('opsDevices').get(), db.collection('opsImports').get(),
    ]);
    const attendanceGroups = new Map<string, Set<string>>();
    const legacyCells = new Map<string, { studentId: string; day: string; value: string; color: string } | null>();
    for (const doc of imports.docs) {
      const source = doc.data();
      const person = students.docs.find(s => s.id === source.matchedStudentId);
      if (!person || !Array.isArray(source.history)) continue;
      const subjects = service.studentSubjects(person.data());
      const matching = service.resolveImportedSubjects(subjects, source.subject);
      if (matching.length !== 1) continue;
      const studentId = service.enrollmentId(person.id, matching[0]);
      const currentHistory = source.history.filter((h: { cells?: { day: string }[] }) => h.cells?.some(c => c.day.startsWith(source.asOf.slice(0, 7))));
      for (const history of currentHistory) {
        const section = String(history.section || '').replace(/\s/g, '');
        let group = String(source.subject || '');
        if (group === '어린이 피아노') {
          group = section.includes('2관') ? '어린이 피아노(2관)' : section === '피아노(어린이)' || section.includes('1관') ? '어린이 피아노(1관)' : '어린이 피아노(관 미확인)';
        }
        const groups = attendanceGroups.get(studentId) || new Set<string>(); groups.add(group); attendanceGroups.set(studentId, groups);
      }
      for (const history of source.history) {
        for (const cell of history.cells || []) {
          if (typeof cell.day !== 'string' || !cell.day.startsWith(`${month}-`) || cell.day > source.asOf) continue;
          const key = `${studentId}_${cell.day}`;
          if (legacyCells.has(key)) { legacyCells.set(key, null); continue; }
          legacyCells.set(key, { studentId, day: cell.day, value: String(cell.value), color: String(cell.color || '') });
        }
      }
    }
    const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map(d => ({ ...d.data(), id: d.id }));
    return Response.json({ day, legacyAttendance: [...legacyCells.values()].filter(Boolean), configured: noticeConfigured(), students: students.docs.flatMap<Snapshot['students'][number]>(d => {
      const raw = d.data(); const base = { name: raw.name || '학생', phone: raw.phone || '' };
      // Preserve existing single-account balances; do not silently duplicate them.
      if (accounts.docs.some(a => a.id === d.id)) return [{ ...base, id: d.id, instruments: service.studentSubjects(raw) }];
      const subjects = service.studentSubjects(raw);
      if (!subjects.length) return [{ ...base, id: d.id, instruments: [] }];
      const known = accounts.docs.filter(a => a.data().sourceStudentId === d.id).map(a => a.data().subject as string);
      return [...new Set([...subjects, ...known])].map(subject => { const id = service.enrollmentId(d.id, subject); const display = accounts.docs.find(a => a.id === id)?.data().displaySubject || subject; const groups = attendanceGroups.get(id); const attendanceGroup = groups?.size === 1 ? [...groups][0] : undefined; return { ...base, id, sourceStudentId: d.id, subject, ...(attendanceGroup ? { attendanceGroup } : {}), name: `${base.name} · ${display}`, instruments: [display] }; });
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
