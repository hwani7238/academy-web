import { database, manager, sameOrigin, failure, hash } from '@/lib/operations/auth';
import { studentSubjects } from '@/lib/operations/service';
export const runtime = 'nodejs';
export const maxDuration = 60;
const normal = (v: unknown) => String(v || '').replace(/\s+|님$/g, '');
const phone = (v: unknown) => String(v || '').replace(/\D/g, '');
export async function GET(request: Request) {
  try {
    await manager(request);
    const rows = await database().collection('opsImports').get();
    return Response.json({ rows: rows.docs.map(d => { const v=d.data(); return { id:d.id, name:v.name, subject:v.subject, sourceRow:v.sourceRow, planUnits:v.planUnits, planAmount:v.planAmount, remainingCandidate:v.remainingCandidate, issues:v.issues, matchedStudentId:v.matchedStudentId, historyCount:v.history?.length || 0 }; }) }, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const actor=await manager(request);
    const input=await request.json();
    if(input.version!==1 || !Array.isArray(input.rows) || input.rows.length<1 || input.rows.length>10) throw new Error('한 번에 1~10개 항목만 가져올 수 있습니다.');
    const db=database(); const students=(await db.collection('students').get()).docs;
    const results=[];
    for(const row of input.rows) {
      if(typeof row.name!=='string' || !row.name.trim() || row.name.length>100 || !Number.isSafeInteger(row.sourceRow) || row.sourceRow<1 || typeof row.subject!=='string' || !Array.isArray(row.raw) || !Array.isArray(row.history) || !Array.isArray(row.issues)) throw new Error('원본 학생 정보를 확인해주세요.');
      if(JSON.stringify(row).length>500000) throw new Error('원본 항목이 너무 큽니다.');
      const candidates=students.filter(d=>normal(d.data().name)===normal(row.name) && phone(row.phone) && phone(d.data().phone)===phone(row.phone));
      const bySubject=candidates.filter(d=>studentSubjects(d.data()).includes(row.subject));
      const match=bySubject.length===1?bySubject[0]:candidates.length===1?candidates[0]:null;
      const id=hash(`roster-v1:${row.sourceRow}`); const ref=db.doc(`opsImports/${id}`);
      const digest=hash(JSON.stringify(row));
      await db.runTransaction(async tx=>{
        const old=await tx.get(ref);
        if(old.exists) { if(old.data()?.digest!==digest) throw new Error(`${row.sourceRow}행 원본이 변경됐습니다. 기존 이관 자료를 먼저 확인해주세요.`);return; }
        tx.create(ref,{...row, digest, source:input.source || '학생 장부', asOf:input.asOf, matchedStudentId:match?.id || null, issues:[...row.issues,...(!match?['기존 학생 연결 확인 필요']:[])], status:'review', importedAt:new Date().toISOString(), actor});
      });
      results.push({id,matched:Boolean(match)});
    }
    return Response.json({results});
  }catch(e){return failure(e);}
}
