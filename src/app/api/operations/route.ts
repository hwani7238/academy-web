import { courseGroup, type Imported } from '@/lib/operations/course-label';
import { correctedLegacy, type LegacyCorrection } from '@/lib/operations/legacy-correction';
import { attendanceSequence } from '@/lib/operations/attendance-sequence';
import type { Account, Attendance } from '@/lib/operations/model';
import { courseLifecycle } from '@/lib/operations/lifecycle';
import { importSources } from '@/lib/operations/import-cache';
import { database, manager, sameOrigin, failure } from '@/lib/operations/auth';
import * as service from '@/lib/operations/service';
import { noticeConfigured, processNotices } from '@/lib/operations/notices';
import { seoulDay, validDay, type Snapshot } from '@/lib/operations/model';
import { after } from 'next/server';
import { operationsRevision } from '@/lib/operations/revision';
import { serverTiming } from '@/lib/operations/server-timing';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const timing = serverTiming();
    await timing.measure('auth', () => manager(request)); const db = database();
    const day = new URL(request.url).searchParams.get('day') || seoulDay();
    validDay(day);
    const params = new URL(request.url).searchParams;
    // Older clients can still request an unconditional snapshot.
    let revision: string | undefined;
    if (params.get('sync') === '1') {
      revision = await timing.measure('revision', () => operationsRevision(db));
      if (params.get('since') === revision) return Response.json({ unchanged: true, revision }, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': timing.header() } });
    }
    const month = day.slice(0, 7); const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
    const [students, accounts, attendance, invoices, payments, notices, devices, imports, priorAttendance, cycleInvoices, legacyCorrections] = await Promise.all([
      timing.measure('students', () => db.collection('students').select('name', 'phone', 'instruments', 'instrument', 'lifecycle', 'courseLifecycles', 'operationsCourseGroups', 'courseUpdatedAt').get()),
      timing.measure('accounts', () => db.collection('opsAccounts').get()),
      timing.measure('attendance', () => db.collection('opsAttendance').where('day', '>=', `${month}-01`).where('day', '<', end.toISOString().slice(0, 10)).get()),
      timing.measure('invoices', () => db.collection('opsInvoices').where('status', 'in', ['open', 'paid']).get()),
      timing.measure('payments', () => db.collection('opsPayments').orderBy('at', 'desc').limit(100).get()),
      timing.measure('notices', () => db.collection('opsNotices').orderBy('createdAt', 'desc').limit(50).get()),
      timing.measure('devices', () => db.collection('opsDevices').get()),
      timing.measure('imports', importSources),
      timing.measure('history', () => db.collection('opsAttendance').where('day', '<', `${month}-01`).select('studentId', 'day', 'units', 'status', 'relatedDay', 'range', 'unpaidCycleStart').get()),
      timing.measure('cycles', () => db.collection('opsInvoices').where('creditUnits', '==', 0).select('studentId', 'cycleStart', 'status').get()),
      timing.measure('legacyCorrections', () => db.collection('opsLegacyCorrections').get()),
    ]);
    const studentById = new Map(students.docs.map(d => [d.id, d]));
    const accountById = new Map(accounts.docs.map(d => [d.id, d.data()]));
    const subjectsByStudent = new Map<string, string[]>();
    for (const a of accounts.docs) { const v = a.data(); if (v.sourceStudentId && v.subject) subjectsByStudent.set(v.sourceStudentId, [...(subjectsByStudent.get(v.sourceStudentId) || []), v.subject]); }
    const sourcesByStudent = new Map<string, Imported[]>();
    for (const doc of imports.docs) {
      const source = doc.data();
      sourcesByStudent.set(source.matchedStudentId, [...(sourcesByStudent.get(source.matchedStudentId) || []), source]);
    }
    const legacyCells = new Map<string, { studentId: string; day: string; value: string; color: string } | null>();
    for (const doc of imports.docs) {
      const source = doc.data();
      const person = studentById.get(source.matchedStudentId);
      if (!person || !Array.isArray(source.history)) continue;
      const subjects = service.studentSubjects(person.data());
      const matching = service.resolveImportedSubjects(subjects, source.subject);
      if (matching.length !== 1) continue;
      const studentId = service.enrollmentId(person.id, matching[0]);
      for (const history of source.history) {
        for (const cell of history.cells || []) {
          if (typeof cell.day !== 'string' || cell.day >= end.toISOString().slice(0, 10) || cell.day > (source.attendanceCutoffs?.[cell.day.slice(0, 7)] || source.asOf)) continue;
          const key = `${studentId}_${cell.day}`;
          if (legacyCells.has(key)) { legacyCells.set(key, null); continue; }
          legacyCells.set(key, { studentId, day: cell.day, value: String(cell.value), color: String(cell.color || '') });
        }
      }
    }
    const rows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map(d => ({ ...d.data(), id: d.id }));
    const namedRows = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.map(d => { const value=d.data(); return {...value,id:d.id,name:accountById.get(value.studentId)?.name||value.name}; });
    const invoiceRows = namedRows(invoices) as Snapshot['invoices'];
    const correctionsById = new Map(legacyCorrections.docs.map(d => [d.id, d.data() as LegacyCorrection]));
    const allLegacy = [...legacyCells.values()].filter((v): v is NonNullable<typeof v> => Boolean(v)).map(row => correctedLegacy(row, correctionsById.get(`${row.studentId}_${row.day}`)));
    const cycleStarts = cycleInvoices.docs.map(d=>d.data()).filter(v=>v.status!=='cancelled' && typeof v.cycleStart==='string').map(v=>({studentId:String(v.studentId),day:String(v.cycleStart)}));
    const beforeMonth = `${month}-01`;
    const priorSequence = attendanceSequence(accounts.docs.map(d=>({...d.data(),id:d.id}) as Account), priorAttendance.docs.map(d=>d.data() as Attendance), allLegacy.filter(r=>r.day<beforeMonth), {positions:{},cycleStarts:cycleStarts.filter(r=>r.day<beforeMonth)});
    const sequenceContext = { positions: priorSequence.positions, missedLessons: priorSequence.missedLessons, cycleFirstDays: priorSequence.cycleFirstDays, cycleStarts:cycleStarts.filter(r=>r.day>=beforeMonth && r.day<end.toISOString().slice(0,10)) };
    const unpaidCycleKeys = [...new Set(priorAttendance.docs.map(d=>d.data()).filter(r=>r.status==='present' && r.unpaidCycleStart).map(r=>`${r.studentId}_${r.unpaidCycleStart}`))];
    return Response.json({ unpaidCycleKeys, ...(revision ? { revision } : {}), day, sequenceContext, legacyAttendance: allLegacy.filter(r=>r.day.startsWith(`${month}-`)), configured: noticeConfigured(), students: students.docs.flatMap<Snapshot['students'][number]>(d => {
      const raw = d.data(); const base = { courseUpdatedAt:raw.courseUpdatedAt || '', name: raw.name || '학생', phone: raw.phone || '', ...(raw.lifecycle ? { lifecycle: raw.lifecycle } : {}) };
      // Preserve existing single-account balances; do not silently duplicate them.
      if (accountById.has(d.id)) { const account = accountById.get(d.id)!; const attendanceGroup = courseGroup({ ...account, name: account.name || base.name }, raw, sourcesByStudent.get(d.id)); return [{ ...base, id: d.id, lifecycle:courseLifecycle(raw,d.id), instruments: service.studentSubjects(raw), ...(attendanceGroup ? { attendanceGroup } : {}) }]; }
      const subjects = service.studentSubjects(raw);
      if (!subjects.length) return [{ ...base, id: d.id, lifecycle:courseLifecycle(raw,d.id), instruments: [] }];
      const known = (subjectsByStudent.get(d.id) || []);
      return [...new Set([...subjects, ...known])].map(subject => { const id = service.enrollmentId(d.id, subject); const overrideGroup=raw.operationsCourseGroups?.[subject]; const display = overrideGroup ? (overrideGroup.includes('피아노')?'피아노':overrideGroup) : accountById.get(id)?.displaySubject || subject; const attendanceGroup = courseGroup({ ...accountById.get(id), subject, name: base.name }, raw, sourcesByStudent.get(d.id)); return { ...base, id, lifecycle:courseLifecycle(raw,id), sourceStudentId: d.id, subject, ...(attendanceGroup ? { attendanceGroup } : {}), name: `${base.name} · ${display}`, instruments: [display] }; });
    }), accounts: rows(accounts), attendance: namedRows(attendance), invoices: invoiceRows.filter(i=>i.status==='open'), settledInvoices: invoiceRows.filter(i=>i.status==='paid'), payments: rows(payments), notices: notices.docs.map(d => { const n = d.data(); return { id: d.id, studentId: n.studentId, name: n.name, kind: n.kind, status: n.status, createdAt: n.createdAt, requestId: n.requestId || '', error: n.error || '' }; }), devices: devices.docs.map(d => { const v = d.data(); return { id: d.id, name: v.name, active: v.active && v.expiresAt > Date.now(), createdAt: v.createdAt }; }) }, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': timing.header() } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const actor = await manager(request); const input = await request.json();
    switch (input.action) {
      case 'correctLegacyAttendance': return Response.json(await service.correctLegacyAttendance(input,actor));
      case 'deleteEnrollment': case 'restoreEnrollment': return Response.json({ok:true,changes:await service.deleteEnrollment(input,actor)});
      case 'saveSchedule': case 'moveLesson': return Response.json({ok:true,changes:await service.saveSchedule(input,actor)});
      case 'renameStudent': await service.renameStudent(input,actor); return Response.json({ok:true});
      case 'correctAttendanceTime': return Response.json({ok:true,changes:await service.correctAttendanceTime(input,actor)});
      case 'changeLifecycle': return Response.json({ok:true,changes:await service.changeLifecycle(input, actor)});
      case 'registerStudent': return Response.json(await service.registerStudent(input, actor));
      case 'correctRemaining': return Response.json({ok:true,changes:await service.correctRemaining(input,actor)});
      case 'manageCourse': await service.manageCourse(input,actor); return Response.json({ok:true});
      case 'configure': return Response.json({ok:true,changes:await service.configure(input, actor)});
      case 'recordAttendanceRange': return Response.json({ok:true,changes:await service.recordAttendanceRange(input,actor)});
      case 'recordAttendance': {
        const changes=await service.recordAttendance(input, actor);
        after(async()=>{try{await processNotices();}catch{console.error('Notification worker failed');}});
        return Response.json({ok:true,changes});
      }
      case 'adjust': await service.adjust(input, actor); break;
      case 'currentCycleInvoice': return Response.json({ok:true,changes:await service.createCurrentCycleInvoice(input,actor)});
      case 'invoice': await service.createInvoice(input.studentId, actor); break;
      case 'editInvoice': await service.editInvoice(input, actor); return Response.json({ok:true});
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
