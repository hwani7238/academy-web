import { refreshImport } from "@/lib/operations/refresh-import";
import { invalidateImportCache } from '@/lib/operations/import-cache';
import { database, manager, sameOrigin, failure, hash } from '@/lib/operations/auth';
import { seoulDay } from '@/lib/operations/model';
import { enrollmentId, studentSubjects, resolveImportedSubjects } from '@/lib/operations/service';
export const runtime = 'nodejs';
export const maxDuration = 60;
const normal = (v: unknown) => String(v || '').replace(/\s+|님$/g, '');
const phone = (v: unknown) => String(v || '').replace(/\D/g, '');
export async function GET(request: Request) {
  try {
    await manager(request);
    const rows = await database().collection('opsImports').get();
    return Response.json({ rows: rows.docs.map(d => { const v=d.data(); return { id:d.id, name:v.name, subject:v.subject, sourceRow:v.sourceRow, planUnits:v.planUnits, planAmount:v.planAmount, remainingCandidate:v.remainingCandidate, issues:v.issues, matchedStudentId:v.matchedStudentId, historyCount:v.history?.length || 0, status:v.status, attendanceRevision:v.attendanceRevision || 0, attendanceAsOf:v.attendanceAsOf || v.asOf }; }) }, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request); const actor=await manager(request);
    const input=await request.json();
    if(input.action==='refresh-attendance') {
      if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>5)throw Error('한 번에 1~5건씩 갱신해주세요.');
      const results=[];
      for(const row of input.rows) results.push(await refreshImport({...row, month:input.month, asOf:input.asOf},actor));
      invalidateImportCache();
      return Response.json({results});
    }
    if(input.action==='activate') {
      if(typeof input.id!=='string'||!/^[a-f0-9]{64}$/.test(input.id))throw new Error('이관 항목을 확인해주세요.');
      const db=database();const ref=db.doc(`opsImports/${input.id}`);
      return Response.json(await db.runTransaction(async tx=>{
        const draft=(await tx.get(ref)).data();
        if(!draft)throw new Error('원본 자료를 찾을 수 없습니다.');
        if(draft.status==='activated')return {ok:true,duplicate:true};
        if(!draft.matchedStudentId || !Number.isSafeInteger(draft.remainingCandidate)||!Number.isSafeInteger(draft.planUnits)||draft.planUnits<1||!Number.isSafeInteger(draft.planAmount)||draft.planAmount<=0||draft.issues.some((v:string)=>v!=='잔여 후보 확인 필요'))throw new Error('확인이 필요한 항목이 남아 있습니다.');
        if(draft.asOf!==seoulDay())throw new Error('이관 기준일을 확인해주세요.');
        const student=(await tx.get(db.doc(`students/${draft.matchedStudentId}`))).data();
        if(!student)throw new Error('연결된 학생이 없습니다.');
        const subjects=studentSubjects(student);
        const matches=resolveImportedSubjects(subjects,draft.subject);
        if(matches.length!==1)throw new Error('등록 과목과 원본 과목을 확인해주세요.');
        const subject=matches[0];const id=enrollmentId(draft.matchedStudentId,subject);
        const accountRef=db.doc(`opsAccounts/${id}`);
        const old=await tx.get(accountRef);const legacy=await tx.get(db.doc(`opsAccounts/${draft.matchedStudentId}`));
        if(old.exists||legacy.exists)throw new Error('이미 수강권이 있어 자동 덮어쓰기를 중단했습니다.');
        const at=new Date().toISOString();
        tx.create(accountRef,{id,sourceStudentId:draft.matchedStudentId,subject,displaySubject:draft.subject,name:`${student.name} · ${draft.subject}`,phone:draft.phone,checkinSuffixes:[draft.phone.slice(-4)],planUnits:draft.planUnits,planAmount:draft.planAmount,remaining:draft.remainingCandidate,openInvoiceId:null,autoBilling:false,active:true,updatedAt:at,importId:input.id,openingAsOf:draft.asOf});
        tx.update(ref,{status:'activated',accountId:id,activatedAt:at});
        tx.create(db.collection('opsAudit').doc(),{actor,action:'import-opening-balance',studentId:id,at,detail:{importId:input.id,remaining:draft.remainingCandidate,asOf:draft.asOf}});
        return {ok:true};
      }));
    }
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
    invalidateImportCache();
    return Response.json({results});
  }catch(e){return failure(e);}
}
