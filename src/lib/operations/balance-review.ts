import { hash } from './auth';
import { seoulDay, type Account, type Attendance, type Invoice } from './model';
export type BalanceAudit = {id:string;studentId?:string;action:string;at:string;detail:Record<string,unknown>};
type Cell={day:string;value:string;color:string};
export type BalanceSource={id:string;asOf:string;attendanceAsOf?:string;attendanceRevision?:number;attendanceCutoffs?:Record<string,string>;remainingCandidate:number;planUnits:number;openingHistory?:{cells?:Cell[]}[];history?:{cells?:Cell[]}[]};
export type BalanceReview={id:string;name:string;group:string;current:number;expected:number|null;ledger:number|null;status:'correct'|'verified'|'confirmed'|'review';reason:string;missingDays:string[];fingerprint:string;updatedAt:string;evidence:{planUnits:number;openingSnapshot:Cell[];invoices:Pick<Invoice,'id'|'units'|'creditUnits'|'cycleStart'|'status'>[];openingDay:string;openingRemaining:number|null;lastCorrection:string;lastOrdinal:string;events:{at:string;action:string;detail:Record<string,unknown>}[];legacy:Cell[];attendance:Pick<Attendance,'day'|'status'|'units'>[]}};
const ignored=new Set(['reserve-next-pass','cancel-next-pass','pass-history','delete-enrollment','restore-enrollment','invoice','cancelInvoice','confirmInvoice','sendInvoice','correct-attendance-time','attendance-range','course-lifecycle','lifecycle','lesson-schedule','move-lesson','manage-course','notice-config-retry','current-cycle-invoice','invoice-lesson-date','configure-invoice']);
const gray=new Set(['FFCCCCCC','FFD9D9D9','FFB7B7B7']);
export function reviewBalance(account:Account,source:BalanceSource|undefined,audits:BalanceAudit[],attendance:Attendance[],invoices:Invoice[]):BalanceReview{
 const events=audits.filter(a=>a.studentId===account.id).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 const corrections=events.filter(a=>a.action==='correct-remaining');
 const correction=corrections.at(-1);
 const baseline=correction || events.find(a=>['import-opening-balance','register-student','configure'].includes(a.action)&&Number.isSafeInteger(a.detail.remaining));
 const records=attendance.filter(a=>a.studentId===account.id);
 const cells=(source?.history||[]).flatMap(h=>h.cells||[]).filter(c=>c.day.slice(0,7)>=(account.openingAsOf||'').slice(0,7)&&c.day<=(source?.attendanceCutoffs?.[c.day.slice(0,7)]||source?.asOf||'')&&c.day<=seoulDay()).sort((a,b)=>a.day.localeCompare(b.day));
 const openingCells=(source?.openingHistory||source?.history||[]).flatMap(h=>h.cells||[]).filter(c=>c.day<=(account.openingAsOf||'') && c.day.slice(0,7)>=(account.openingAsOf||'').slice(0,7)).sort((a,b)=>a.day.localeCompare(b.day));
 const fingerprint=hash(JSON.stringify([account.id,account.updatedAt,account.remaining,account.planUnits,source?.attendanceRevision,source?.attendanceAsOf,cells,openingCells,events,records,invoices.filter(i=>i.studentId===account.id)]));
 const evidence={planUnits:account.planUnits,openingSnapshot:openingCells,invoices:invoices.filter(i=>i.studentId===account.id).map(i=>({id:i.id,units:i.units,creditUnits:i.creditUnits,cycleStart:i.cycleStart,status:i.status})),openingDay:account.openingAsOf||'',openingRemaining:source?.remainingCandidate??null,lastCorrection:correction?.at||'',lastOrdinal:'',events:events.filter(e=>!ignored.has(e.action)).map(e=>({at:e.at,action:e.action,detail:e.detail})),legacy:cells,attendance:records.map(r=>({day:r.day,status:r.status,units:r.units}))};
 const result:BalanceReview={id:account.id,name:account.name,group:account.attendanceGroup||account.subject||'',current:account.remaining,expected:null,ledger:null,status:'review',reason:'',missingDays:[],fingerprint,updatedAt:account.updatedAt,evidence};
 const stop=(reason:string)=>({...result,status:'review' as const,reason});
 if(!baseline)return stop('잔여 횟수의 시작 근거가 없어 확인이 필요합니다.');
 let ledger=Number(correction?baseline.detail.after:baseline.detail.remaining);
 if(!Number.isSafeInteger(ledger))return stop('시작 잔여 횟수를 확인해주세요.');
 const credited=new Set<string>();
 for(const event of events.slice(events.indexOf(baseline)+1)){
  const d=event.detail;
  if(event.action==='check-in')ledger-=Number(d.units);
  else if(event.action==='record-attendance')ledger-=Number(d.units)-Number(d.before);
  else if(event.action==='activate-next-pass')ledger+=Number(d.units);
  else if(event.action==='adjust')ledger-=Number(d.after)-Number(d.before);
  else if(event.action==='payment' && d.complete){
   const invoice=invoices.find(i=>i.id===d.invoiceId&&i.studentId===account.id);
   if(!invoice||credited.has(invoice.id))return stop('수납의 수강 횟수 반영 근거를 확인해주세요.');
   credited.add(invoice.id);ledger+=invoice.creditUnits??invoice.units;
  }else if(event.action==='correct-legacy-attendance')return stop('이전 출결을 정정했습니다. 현재 잔여 횟수도 맞는지 확인해주세요.');
  else if(event.action==='configure' || event.action==='payment' || ignored.has(event.action)){
   // Configuration and billing requests do not reset a balance.
  }else return stop(`별도 변경 이력 확인 필요: ${event.action}`);
  if(!Number.isSafeInteger(ledger))return stop('잔여 변경 이력의 횟수가 불명확합니다.');
  if(Number.isSafeInteger(d.remaining)&&d.remaining!==ledger)return stop(`변경 이력 사이의 잔여가 일치하지 않습니다 (${event.at.slice(0,10)}, 계산 ${ledger}, 기록 ${d.remaining}).`);
 }
 result.ledger=ledger;
 if(ledger!==account.remaining)return stop(`변경 이력 계산 ${ledger}회와 현재 ${account.remaining}회가 달라 별도 정정 근거 확인이 필요합니다.`);
 if(correction && cells.some(c=>c.day>seoulDay(new Date(correction.at))&&!gray.has(c.color)&&Number(c.value)>0&&!records.some(r=>r.day===c.day)))return stop('직접 정정 이후 장부에 추가된 출석을 확인해주세요.');
 if(correction){result.expected=ledger;result.status='confirmed';result.reason=`${seoulDay(new Date(correction.at))} 직접 정정한 잔여를 기준으로 이후 출석·수납이 일치합니다.`;return result;}
 if(!account.importId){result.expected=ledger;result.status='verified';result.reason='등록 이후 출석·수납 변경 이력과 일치합니다.';return result;}
 if(!source || !account.openingAsOf || baseline.action!=='import-opening-balance')return stop('최초 이관 기준과 장부 연결을 확인해주세요.');
 if(source.planUnits!==account.planUnits)return stop('이관 후 수강권 횟수가 변경되어 장부 회차 기준을 확인해야 합니다.');
 if(source.remainingCandidate!==baseline.detail.remaining || baseline.detail.asOf!==account.openingAsOf)return stop('이관 기준 잔여 또는 날짜가 일치하지 않습니다.');
 const initial=openingCells.filter(c=>c.day<=account.openingAsOf!&&!gray.has(c.color)&&c.color!=='FFFF9900'&&Number.isSafeInteger(Number(c.value))&&Number(c.value)>0).at(-1);
 let ordinal=initial?Number(initial.value):0;
 if(source.planUnits-ordinal!==source.remainingCandidate)return stop('이관 당시 회차와 잔여 후보가 일치하지 않아 원본 확인이 필요합니다.');
 if(initial && !cells.some(c=>c.day===initial.day&&c.value===initial.value&&c.color===initial.color))return stop('최초 이관 기준 회차가 원본에서 변경되어 확인이 필요합니다.');
 const recent=cells.filter(c=>c.day>(initial?.day||account.openingAsOf!));
 let paidRenewals=[...credited].filter(id=>{const i=invoices.find(i=>i.id===id)!;return (i.creditUnits??i.units)===account.planUnits;}).length;
 if(new Set(recent.map(c=>c.day)).size!==recent.length)return stop('같은 날짜의 장부 행이 여러 개입니다.');
 for(const c of recent){
  if(gray.has(c.color)||!c.value.trim())continue;
  const n=Number(c.value);
  if(!Number.isSafeInteger(n)||n<1){if(/^(결석|여행|병가|휴원|취소)$/.test(c.value.trim()))continue;return stop(`${c.day} 장부의 ‘${c.value}’ 차감 여부 확인이 필요합니다.`);}
  if(n===1 && ordinal===source.planUnits && paidRenewals>0){ordinal=0;paidRenewals--;}
  if(n!==ordinal+1||n>source.planUnits)return stop(`${c.day} 장부 회차 ${ordinal}→${n}: 재등록·보강 여부를 확인해야 합니다.`);
  ordinal=n;result.evidence.lastOrdinal=`${c.day} ${n}회차`;
  const modern=records.find(r=>r.day===c.day);
  if(!modern)result.missingDays.push(c.day);
  else if(modern.units!==1 || !['present','makeup'].includes(modern.status||'present'))return stop(`${c.day} 장부와 직접 입력한 출결 상태가 달라 확인이 필요합니다.`);
 }
 // Backdated modern attendance can overlap classes already included in the opening balance.
 if(records.some(r=>r.day<=account.openingAsOf!&&r.units>0&&cells.some(c=>c.day===r.day&&!gray.has(c.color))))return stop('이관 기준일 이전에 직접 입력한 출석과 원본이 겹칩니다.');
 if(invoices.some(i=>i.studentId===account.id&&i.cycleStart&&i.cycleStart>account.openingAsOf!&&i.status!=='cancelled'))return stop('이관 이후 재등록한 수강권의 잔여 확인이 필요합니다.');
 result.expected=ledger-result.missingDays.length;
 result.status=result.missingDays.length?'correct':'verified';
 result.reason=result.missingDays.length?`장부 갱신분 ${result.missingDays.length}회가 잔여에 미반영: ${result.missingDays.join(', ')}`:'이관 이후 장부·출석·수납이 일치합니다.';
 return result;
}
