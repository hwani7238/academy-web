import { database, hash } from './auth';
import { seoulDay } from './model';

type Cell = { day: string; value: string; color: string; fill?: string; cell?: string };
type History = { name: string; subject: string; sheet: string; row: number; section: string; note: string; cells: Cell[]; month?: string };
const normal = (v: string) => v.replace(/\s+|님$/g, '');

// Refresh the source archive only. Opening balances and live attendance have separate ownership.
export async function refreshImport(input: { id: string; revision: number; month: string; asOf: string; history: History[] }, actor: string) {
  const { id, revision, month, asOf, history } = input;
  if (!/^[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(revision) || revision < 0 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
      asOf.slice(0, 7) !== month || asOf > seoulDay() || new Date(asOf).toISOString().slice(0, 10) !== asOf ||
      !Array.isArray(history) || history.length !== 1 || JSON.stringify(history).length > 50000) throw Error('출결 갱신 자료를 확인해주세요.');
  const h = history[0];
  if (typeof h.name !== 'string' || typeof h.subject !== 'string' || typeof h.sheet !== 'string' ||
      typeof h.section !== 'string' || typeof h.note !== 'string' || !Number.isSafeInteger(h.row) || h.row < 1 ||
      !Array.isArray(h.cells) || h.cells.length > 31) throw Error('출결 원본 행을 확인해주세요.');
  const days = new Set<string>();
  for (const c of h.cells) {
    if (typeof c.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.day) || !c.day.startsWith(month + '-') ||
        c.day > asOf || new Date(c.day).toISOString().slice(0, 10) !== c.day || days.has(c.day) ||
        typeof c.value !== 'string' || c.value.length > 200 || typeof c.color !== 'string') throw Error('출결 날짜 또는 중복 기록을 확인해주세요.');
    days.add(c.day);
  }
  const nextHistory = [{ ...h, month }];
  const digest = hash(JSON.stringify({ month, asOf, history: nextHistory }));
  const db = database(); const ref = db.doc(`opsImports/${id}`);
  return db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if (!old || normal(old.name) !== normal(h.name) || old.subject !== h.subject) throw Error('학생과 과목이 기존 장부와 일치하지 않습니다.');
    if (old.attendanceDigest === digest) return { id, duplicate: true };
    if ((old.attendanceRevision || 0) !== revision) throw Error('장부가 변경됐습니다. 새로고침 후 다시 가져와주세요.');
    if (asOf < (old.attendanceCutoffs?.[month] || old.asOf)) throw Error('이전 날짜의 자료로 되돌릴 수 없습니다.');
    const belongs = (r: History) => r.month === month || r.sheet === h.sheet || r.cells?.some(c => c.day.startsWith(month + '-'));
    const previous = (old.history || []).filter(belongs);
    if (previous.length > 1) throw Error('같은 학생·과목의 원본 행이 여러 개입니다. 확인이 필요합니다.');
    const at = new Date().toISOString();
    tx.create(db.doc(`opsImports/${id}/revisions/${revision + 1}`), { month, history: previous, asOf: old.attendanceCutoffs?.[month] || old.asOf, at, actor });
    tx.update(ref, { history: [...(old.history || []).filter((r: History) => !belongs(r)), ...nextHistory],
      attendanceCutoffs: { ...(old.attendanceCutoffs || {}), [month]: asOf }, attendanceAsOf: asOf,
      attendanceRevision: revision + 1, attendanceDigest: digest, attendanceUpdatedAt: at });
    tx.create(db.collection('opsAudit').doc(), { actor, action: 'refresh-attendance-archive', at,
      detail: { importId: id, month, asOf, revision: revision + 1, cells: h.cells.length } });
    return { id, duplicate: false, cells: h.cells.length };
  });
}
