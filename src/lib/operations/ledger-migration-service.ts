import {database,hash} from './auth';
import {ledgerDatabase} from './ledger-store';
import {courseLedgerReports,readCourseLedgerEvidence,ledgerFingerprint} from './course-ledger-service';
import {prepareLessonLedger} from './lesson-ledger-migration';
import {seoulDay} from './model';

export async function ledgerMigrationReports(){
 const reports=await courseLedgerReports(true);
 return reports.map(r=>{const e=r.evidence!;const preview=prepareLessonLedger(e as Parameters<typeof prepareLessonLedger>[0],seoulDay(),r.fingerprint);return {studentId:r.studentId,name:r.name,fingerprint:r.fingerprint,version:e.account.ledgerVersion||1,...preview};});
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
