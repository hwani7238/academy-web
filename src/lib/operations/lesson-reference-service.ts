import { database, hash, HttpError } from './auth';
import { parseLessonSource, matchLessonSource, referenceOrdinal, type LessonReference } from './lesson-reference';
import { seoulDay, validDay, type Snapshot } from './model';

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

/** Correct only selected reference cells; the financial and attendance ledgers stay intact. */
export async function correctLessonReferences(input: Record<string, unknown>, actor: string) {
  const month=String(input.month||''),studentId=String(input.studentId||'');
  validDay(month+'-01');
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(studentId))throw Error('학생·과목을 선택해주세요.');
  if(!Array.isArray(input.cells)||!input.cells.length||input.cells.length>31)throw Error('수정할 날짜를 확인해주세요.');
  const seen=new Set<string>();
  const cells=input.cells.map((cell:{day:unknown;value:unknown})=>{
    const day=validDay(cell.day),value=typeof cell.value==='string'?cell.value.trim():'';
    if(!day.startsWith(month+'-')||seen.has(day)||(value&&!referenceOrdinal(value)))throw Error('날짜 또는 회차를 확인해주세요.');
    seen.add(day);return {day,value};
  });
  const db=database(),ref=db.doc('opsLessonReferences/'+month);
  return db.runTransaction(async tx=>{
    const [snap,account]=await Promise.all([tx.get(ref),tx.get(db.doc('opsAccounts/'+studentId))]);
    const previous=snap.data();
    if(!previous||!account.exists)throw Error('기존 장부와 수강 등록을 확인해주세요.');
    if(previous.revision!==input.expectedRevision)throw new HttpError(409,'장부 회차가 변경되었습니다. 창을 닫고 다시 확인해주세요.');
    const before=(previous.references||[]) as LessonReference[];
    const references=before.filter(r=>r.studentId!==studentId||!seen.has(r.day));
    for(const cell of cells){
      if(!cell.value)continue;
      const old=before.find(r=>r.studentId===studentId&&r.day===cell.day);
      references.push({...cell,studentId,color:old?.color||'',row:old?.row||before.find(r=>r.studentId===studentId)?.row||1});
    }
    references.sort((a,b)=>a.studentId.localeCompare(b.studentId)||a.day.localeCompare(b.day));
    const revision=hash(JSON.stringify({source:previous.source,references})),updatedAt=new Date().toISOString();
    const matched=(previous.matched||[]).map((r:{studentId:string})=>r.studentId===studentId?{...r,count:references.filter(v=>v.studentId===studentId).length}:r);
    const after={...previous,references,matched,revision,updatedAt,actor};
    tx.set(ref,after);
    tx.set(db.collection('opsAudit').doc(),{action:'correctLessonReferences',actor,at:updatedAt,month,studentId,before:previous,after});
    return {ok:true,revision};
  });
}
