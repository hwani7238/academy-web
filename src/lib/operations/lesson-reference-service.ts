import { database, hash, HttpError } from './auth';
import { parseLessonSource, matchLessonSource } from './lesson-reference';
import { seoulDay, type Snapshot } from './model';

export async function reconcileLessonReferences(input: Record<string, unknown>, actor: string, students: Snapshot['students']) {
  const month = String(input.month || '');
  const rows = parseLessonSource(input.rows, month);
  const result = matchLessonSource(rows, students, seoulDay());
  if (!result.references.length) throw Error('확정할 수 있는 회차가 없습니다.');
  const source = String(input.source || '');
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:\/[^\s]*)?$/.test(source)) throw Error('원본 장부 주소를 확인해주세요.');
  const db = database(), ref = db.doc(`opsLessonReferences/${month}`);
  const revision = hash(JSON.stringify({ source, rows, references: result.references }));
  await db.runTransaction(async tx => {
    const previous = (await tx.get(ref)).data();
    if (previous?.revision === revision) return;
    if ((previous?.revision || '') !== input.expectedRevision) throw new HttpError(409, '장부 회차가 변경되었습니다. 새로고침한 뒤 다시 확인해주세요.');
    const updatedAt = new Date().toISOString();
    const value = { month, source, references: result.references, matched: result.matched, excluded: result.excluded, revision, updatedAt, actor };
    // Only a display/sequence reference is written: attendance, links, balances,
    // schedules, invoices and payments remain untouched. Keep the previous version.
    tx.set(ref, value);
    tx.set(db.collection('opsAudit').doc(), { action: 'reconcileLessonReferences', actor, at: updatedAt, month, before: previous || null, after: value });
  });
  return { ok: true, revision, matched: result.matched.length, cells: result.references.length, excluded: result.excluded };
}
