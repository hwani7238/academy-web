import {projectLessonLedger,type LessonLedgerSeed,type ArchivedLesson,type LedgerPassSeed} from './lesson-ledger';
import type {LedgerEvidence} from './course-ledger';
import {attendanceSequence} from './attendance-sequence';
import {legacyAttendanceAppearance} from './attendance-appearance';
import {passStart} from './pass-settlement';

export type LedgerMigrationPreview={seed:LessonLedgerSeed;projection:ReturnType<typeof projectLessonLedger>;issues:string[];beforeRemaining:number;afterRemaining:number;ready:boolean};
/** Preserve the imported opening history as an explicit baseline. Current and
 * subsequent passes are rebuilt from real attendance, not receipt side effects. */
export function prepareLessonLedger(e:LedgerEvidence,today:string,fingerprint:string):LedgerMigrationPreview{
 const a=e.account,records=e.attendance.filter(r=>r.studentId===a.id).sort((x,y)=>x.day.localeCompare(y.day));
 const dated=e.invoices.filter(i=>i.status!=='cancelled'&&i.allocationState==='allocated'&&passStart(i)&&passStart(i)<=today).sort((x,y)=>passStart(x).localeCompare(passStart(y)));
 const issues:string[]=[];
 const modernFirst=records[0]?.day||today;
 // Start at a financially identified pass, retaining earlier source lessons as
 // archived makeup rights. Do not reinterpret years of spreadsheet history.
 const first=dated.filter(i=>passStart(i)<=modernFirst).at(-1)||dated[0];
 let from=first?passStart(first):modernFirst;
 const effectiveBills=dated.filter(i=>passStart(i)>=from);
 const passSeeds:LedgerPassSeed[]=effectiveBills.map((i,n)=>({id:i.passId||i.id,invoiceId:i.id,start:passStart(i),units:i.units,amount:i.amount,fixedStart:n===0||!!i.renewalReservation&&i.renewalReservation.mode==='date'}));
 if(new Set(passSeeds.map(p=>p.start)).size!==passSeeds.length)issues.push('같은 시작일의 수강권이 여러 개입니다.');
 if(!passSeeds.length){
  // An opening balance is evidence of rights, not a receipt. Preserve it without
  // manufacturing paid status; owner review resolves its historical linkage.
  from=today;passSeeds.push({id:`opening_${a.id}`,invoiceId:'',start:today,units:a.planUnits,amount:a.planAmount,openingOrdinal:Math.max(0,a.planUnits-a.remaining),openingUsed:Math.max(0,a.planUnits-a.remaining),fixedStart:true});
  issues.push('현재 수강권의 시작일·수납 연결 확인 필요');
 }
 const references=e.references.filter(r=>records.some(v=>v.day===r.day));
 const sequence=attendanceSequence([a],records,e.legacy,{positions:{},references,cycleStarts:effectiveBills.map(i=>({studentId:a.id,day:passStart(i)}))});
 const firstRecord=records.find(r=>r.day>=from&&!['paused','cancelled','makeup','makeup_reserved'].includes(r.status||'present'));
 if(firstRecord&&firstRecord.day>from){
  const ref=e.references.find(r=>r.day===firstRecord.day),legacy=e.legacy.filter(r=>r.day>=from&&r.day<firstRecord.day).sort((x,y)=>x.day.localeCompare(y.day));
  const n=ref?Number(ref.value.split(/[·,+]/)[0]):legacy.length?Number(legacy.at(-1)!.value)+1:undefined;
  if(n&&Number.isInteger(n)&&n<=passSeeds[0].units){passSeeds[0].openingOrdinal=n-1;passSeeds[0].openingUsed=n-1;}
  else if(!legacy.length&&from!==firstRecord.day)issues.push(`${from}: 첫 수업일부터 ${firstRecord.day} 이전의 회차 확인 필요`);
 }
 const archived:ArchivedLesson[]=[];
 const sources=new Set(records.filter(r=>['makeup','makeup_reserved'].includes(r.status||'')&&r.relatedDay&&r.relatedDay<from).map(r=>r.relatedDay!));
 for(const row of records.filter(r=>r.day<from&&['absent','travel','sick','late_cancel'].includes(r.status||'')))sources.add(row.day);
 for(const day of sources){
  const row=records.find(r=>r.day===day),old=e.legacy.find(r=>r.day===day),ref=e.references.find(r=>r.day===day);
  const status=row?.status||(old?legacyAttendanceAppearance(old).tone:ref?legacyAttendanceAppearance(ref).tone:'');
  const ordinal=Number(sequence.labels.get(`${a.id}_${day}`)||ref?.value||old?.value);
  const eligible=['absent','travel','sick','late_cancel'].includes(status||'');
  if(!eligible)issues.push(`${day}: 이전 보강 원수업 확인 필요`);
  archived.push({day,passId:row?.passId||`archived_${a.id}_${day}`,ordinal:Number.isInteger(ordinal)&&ordinal>0?ordinal:null,charged:row?.units||0,makeupEligible:eligible});
 }
 for(const i of e.invoices.filter(i=>i.status!=='cancelled'&&i.paid>0&&(!passStart(i)||i.linkReview)))issues.push(`수납 ${i.id}: 첫 수업일 연결 확인 필요`);
 // A spreadsheet-only date is not proof of an additional attendance. Keep its
 // original reference unchanged, and rely on the signed/manual source records.
 const seed:LessonLedgerSeed={version:2,from,passes:passSeeds,archived,adjustments:[],createdAt:today,sourceFingerprint:fingerprint};
 const projection=projectLessonLedger(a,seed,records,e.invoices,today);
 issues.push(...projection.issues);
 const current=projection.passes.find(p=>p.id===projection.currentPassId);
 if(current&&!current.actual&&!records.some(r=>r.day>=from))issues.push('현재 수강권의 실제 출결이 없어 시작 잔여 확인 필요');
 return {seed,projection,issues:[...new Set(issues)],beforeRemaining:a.remaining,afterRemaining:projection.currentRemaining,ready:issues.length===0};
}
