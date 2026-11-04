import {database,hash} from './auth';
import {ledgerDatabase} from './ledger-store';
import {courseLedgerReports,readCourseLedgerEvidence,ledgerFingerprint} from './course-ledger-service';
import {prepareLessonLedger} from './lesson-ledger-migration';
import {projectLessonLedger,type LessonLedgerSeed} from './lesson-ledger';
import {seoulDay} from './model';

export async function ledgerMigrationReports(){
 const [reports,stored]=await Promise.all([courseLedgerReports(true),database().collection('opsCourseLedgers').get()]);
 return reports.map(r=>{const e=r.evidence!,old=stored.docs.find(d=>d.id===r.studentId)?.data();const preview=old?.version===2?(()=>{const seed=old.seed as LessonLedgerSeed,projection=projectLessonLedger(e.account as Parameters<typeof projectLessonLedger>[0],seed,e.attendance,e.invoices,seoulDay());return {seed,projection,issues:projection.issues,beforeRemaining:e.account.remaining,afterRemaining:projection.currentRemaining,ready:projection.issues.length===0};})():prepareLessonLedger(e as Parameters<typeof prepareLessonLedger>[0],seoulDay(),r.fingerprint);return {studentId:r.studentId,name:r.name,fingerprint:r.fingerprint,version:e.account.ledgerVersion||1,...preview};});
}
/** A fresh evidence fingerprint and a reproducible preview are required. Source
 * facts and receipt amounts are never changed by migration. */
export async function migrateLessonLedger(input:Record<string,unknown>,actor:string){
 const id=String(input.studentId||''),fingerprint=String(input.fingerprint||'');
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(id)||!fingerprint)throw Error('먼저 수강권 계산 전환 점검을 실행해주세요.');
 const db=ledgerDatabase();
 return db.runTransaction(async tx=>{
  const ledgerRef=db.doc(`opsCourseLedgers/${id}`),old=(await tx.get(ledgerRef)).data();
  if(old?.version===2)return {ok:true,duplicate:true};
  const e=await readCourseLedgerEvidence(id,tx);
  if(ledgerFingerprint(e)!==fingerprint)throw Error('점검 후 기록이 변경되었습니다. 다시 점검해주세요.');
  const plan=prepareLessonLedger(e,seoulDay(),fingerprint);
  if(!plan.ready)throw Error(plan.issues.join(' / '));
  const stamp=new Date().toISOString();
  tx.set(ledgerRef,JSON.parse(JSON.stringify({version:2,seed:plan.seed,revision:'migration',updatedAt:stamp})));
  tx.update(db.doc(`opsAccounts/${id}`),{ledgerVersion:2,updatedAt:stamp});
  tx.create(db.doc(`opsAudit/migrate_${hash(id+fingerprint)}`),{actor,action:'migrate-lesson-ledger',studentId:id,at:stamp,detail:{fingerprint,before:{account:e.account,ledger:old||null},after:{seed:plan.seed,remaining:plan.afterRemaining},attendanceFactsUnchanged:true,receiptFactsUnchanged:true,reason:'기존 출결·수강권 근거에 따른 회차 원장 전환'}});
  return {ok:true,remaining:plan.afterRemaining};
 });
}

export async function saveLedgerSheetSource(input:Record<string,unknown>,actor:string){
 const {prepareLedgerSheetSource}=await import('./ledger-sheet-source');
 if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>200)throw Error('학생별 원본 자료를 확인해주세요.');
 const db=database(),saved:string[]=[],errors:{name:string;reason:string}[]=[];
 for(const row of input.rows){try{const id=String(row.studentId||'');if(!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('학생·과목 확인 필요');await db.runTransaction(async tx=>{
  const e=await readCourseLedgerEvidence(id,tx),ledger=(await tx.get(db.doc(`opsCourseLedgers/${id}`))).data();
  if(ledger?.version===2)throw Error('이미 새 계산으로 전환된 수강권입니다. 기존 출결 수정에서 확인해주세요.');
  if(ledgerFingerprint(e)!==row.fingerprint)throw Error('점검 후 변경된 기록입니다. 다시 점검해주세요.');
  const source=prepareLedgerSheetSource(e,{...row,source:input.source}),ref=db.doc(`opsLedgerSources/${id}`),before=(await tx.get(ref)).data();
  tx.set(ref,source);tx.create(db.collection('opsAudit').doc(),{studentId:id,actor,action:'import-ledger-sheet-source',at:source.updatedAt,detail:{before:before||null,after:source,nativeAttendanceUnchanged:true,paymentsUnchanged:true}});
 });saved.push(id);}catch(error){errors.push({name:String(row.name||row.studentId),reason:error instanceof Error?error.message:'저장 실패'});}}
 return {ok:errors.length===0,saved,errors};
}
