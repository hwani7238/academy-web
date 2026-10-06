import {passHistoryInput,passCycleStarts} from '@/lib/operations/pass-history';
import {placeTimetableLesson,placeRegularTimetableLesson} from '@/lib/operations/timetable';
import { guardianPhone, contactAccount } from '@/lib/operations/student-contact';
import { invoiceForPlan } from '@/lib/operations/plan-invoice';
import { legacyAttendanceAppearance } from '@/lib/operations/attendance-appearance';
import { paymentDateInput } from '@/lib/operations/billing-display';
import { correctedLegacy, legacyCorrectionInput } from '@/lib/operations/legacy-correction';
import { changeSchedule, moveLesson } from '@/lib/operations/schedule';
import { rangeAttendance } from '@/lib/operations/attendance-range';
import { enrollmentState, lifecycleInput, deleteOrRestoreEnrollment } from '@/lib/operations/lifecycle';
import { correctedArrival } from '@/lib/operations/attendance-time';
import { checkInName } from '@/lib/operations/course-label';
import { REGISTRATION_SUBJECTS, registrationInput, firstEnrollmentInvoice } from '@/lib/operations/registration';
import { Snapshot, Account, integer, adjustBalance, settle, seoulDay, suffixes, validDay, attendanceInput } from '@/lib/operations/model';
export function sample(): Snapshot {
  const stamp = new Date().toISOString();
  const accounts: Account[] = [
    { id: 'demo-a', sourceStudentId: 'person-a', subject: '어린이 피아노', name: '김하늘 · 어린이 피아노', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 1, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-b', sourceStudentId: 'person-b', subject: '통기타', name: '이서준 · 통기타', phone: '01000005678', checkinSuffixes: ['5678'], planUnits: 12, planAmount: 210000, remaining: 4, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
    { id: 'demo-c', sourceStudentId: 'person-c', subject: '성인 피아노', name: '김하린 · 성인 피아노', phone: '01000001234', checkinSuffixes: ['1234'], planUnits: 8, planAmount: 160000, remaining: 6, openInvoiceId: null, autoBilling: false, active: true, updatedAt: stamp },
  ];
  accounts.push({ ...accounts[2], id: 'demo-c-vocal', subject: '보컬', name: '김하린 · 보컬', planUnits: 4, planAmount: 180000, remaining: 2 });
  accounts[0].attendanceGroup = '어린이 피아노(1관)';
  const previousMonth=new Date(`${seoulDay().slice(0,7)}-01T00:00:00Z`);previousMonth.setUTCMonth(previousMonth.getUTCMonth()-1);
  const month=previousMonth.toISOString().slice(0,7);
  const legacyAttendance=[{studentId:'demo-b',day:month+'-19',value:'7',color:''},{studentId:'demo-b',day:month+'-21',value:'8',color:''}].map(row=>correctedLegacy(row));
  return { legacyAttendance, sequenceContext: {positions:Object.fromEntries(accounts.map(a=>[a.id, a.planUnits-a.remaining])),cycleStarts:[]}, accounts, students: accounts.map(({ id, name, phone, sourceStudentId, subject, attendanceGroup }) => ({ id, name, phone, sourceStudentId, subject, attendanceGroup, instruments: subject ? [subject] : [] })), attendance: [], invoices: [], payments: [], notices: [], devices: [], day: seoulDay(), configured: false };
}
export function demoAction(current: Snapshot, input: Record<string, unknown>): { data: Snapshot; result: Record<string, unknown> } {
  if(input.action==='saveStudentInfo'){
    const target=current.students.find(s=>s.id===input.studentId&&(s.sourceStudentId||s.id)===input.sourceStudentId);
    if(!target)throw Error('학생을 찾을 수 없습니다.');
    if((Object.hasOwn(input,'name')||Object.hasOwn(input,'group'))&&(target.name.split(' · ')[0]!==input.expectedName||(target.courseUpdatedAt||'')!==(input.expectedCourseUpdatedAt||'')))throw Error('학생 정보가 다른 화면에서 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    // Intermediate clones are only returned after every edit succeeds.
    let next=current;
    if(Object.hasOwn(input,'group'))next=demoAction(next,{...input,action:'manageCourse',expectedUpdatedAt:input.expectedCourseUpdatedAt}).data;
    if(Object.hasOwn(input,'name'))next=demoAction(next,{...input,action:'renameStudent',expectedUpdatedAt:input.expectedCourseUpdatedAt}).data;
    if(Object.hasOwn(input,'phone'))next=demoAction(next,{...input,action:'updateStudentPhone',expectedUpdatedAt:input.expectedPhoneUpdatedAt}).data;
    return {data:next,result:{ok:true}};
  }
  const data = structuredClone(current); const at = new Date().toISOString();
  const account = data.accounts.find(a => a.id === input.studentId);
  const enqueue = (a: Account, id: string, kind: 'attendance' | 'billing') => data.notices.unshift({ id, studentId: a.id, name: a.name, kind, status: 'demo', createdAt: at });
  const invoice = (a: Account) => {
    if (a.openInvoiceId) return;
    const id = crypto.randomUUID(); a.openInvoiceId = id;
    data.invoices.push({ id, studentId: a.id, name: a.name, units: a.planUnits, amount: a.planAmount, paid: 0, status: 'open', needsReview: false, createdAt: at });
    if (a.autoBilling) enqueue(a, `billing_${id}`, 'billing');
  };
  let result: Record<string, unknown> = { ok: true };
  if(input.action==='correctLegacyAttendance'){
    const row=data.legacyAttendance?.find(r=>r.studentId===input.studentId&&r.day===input.day);
    if(!row||!account)throw Error('이전 출결을 찾을 수 없습니다.');
    if(row.revision!==input.expectedRevision)throw Error('이전 출결이 변경됐습니다.');
    Object.assign(row,legacyCorrectionInput(input),{revision:crypto.randomUUID()});
  } else if(input.action==='savePassHistory'){
    if(!account||account.updatedAt!==input.expectedUpdatedAt)throw Error('수강 정보가 변경됐습니다. 다시 확인해주세요.');
    account.passHistory=passHistoryInput(input.history,account.planUnits);account.updatedAt=at;
    data.sequenceContext={...data.sequenceContext,positions:data.sequenceContext?.positions||{},cycleStarts:[...(data.sequenceContext?.cycleStarts||[]).filter(r=>r.studentId!==account.id),...passCycleStarts([account])]};
  } else if(input.action==='saveSchedule'||input.action==='moveLesson'||input.action==='placeTimetableLesson'||input.action==='placeRegularTimetableLesson'){
    if(!account)throw Error('먼저 수강 등록을 완료해주세요.');
    const stamp=new Date(Math.max(Date.now(),Date.parse(account.schedule?.updatedAt||'')+1||0)).toISOString();
    account.schedule=input.action==='placeRegularTimetableLesson'?placeRegularTimetableLesson(account.schedule,input,stamp):input.action==='placeTimetableLesson'?placeTimetableLesson(account.schedule,input,data.attendance.filter(r=>r.studentId===account.id),stamp):input.action==='moveLesson'?moveLesson(account.schedule,input,data.attendance.filter(r=>r.studentId===account.id),stamp):changeSchedule(account.schedule,input,stamp);
  } else if(input.action==='updateStudentPhone'){
    const source=String(input.sourceStudentId),siblings=data.students.filter(s=>(s.sourceStudentId||s.id)===source),target=siblings.find(s=>s.id===input.studentId);
    if(!target)throw Error('학생을 찾을 수 없습니다.');
    const phone=guardianPhone(input.phone);
    if(target.phone.replace(/\D/g,'')!==String(input.expectedPhone??'').replace(/\D/g,'')||(target.phoneUpdatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('보호자 번호가 다른 화면에서 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    const ids=new Set(siblings.map(s=>s.id)),previousPhone=target.phone;
    data.accounts=data.accounts.map(a=>ids.has(a.id)?contactAccount(a,previousPhone,phone,at):a);
    for(const row of siblings){row.phone=phone;row.phoneUpdatedAt=at;}
  } else if(input.action==='renameStudent'){
    const source=String(input.sourceStudentId),siblings=data.students.filter(s=>(s.sourceStudentId||s.id)===source),target=siblings.find(s=>s.id===input.studentId);
    const name=typeof input.name==='string'?input.name.trim():'';
    if(!target||!name||name.length>100||/[\r\n\u0000]/.test(name))throw Error('학생 이름을 확인해주세요.');
    if(target.name.split(' · ')[0]!==input.expectedName||(target.courseUpdatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('학생 정보가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    const ids=new Set(siblings.map(s=>s.id));
    const renamed=(old:string)=>[name,...old.split(' · ').slice(1)].join(' · ');
    for(const row of siblings){row.name=renamed(row.name);row.courseUpdatedAt=at;}
    for(const row of data.accounts.filter(a=>ids.has(a.id))){row.name=renamed(row.name);row.updatedAt=at;}
    for(const row of [...data.attendance,...data.invoices].filter(r=>ids.has(r.studentId)))row.name=renamed(row.name);
  } else if(input.action==='correctAttendanceTime'){
    const row=data.attendance.find(a=>a.id===input.attendanceId);
    if(!row)throw Error('출석 기록을 찾을 수 없습니다.');
    const arrivalAt=correctedArrival(row.day,input.time);
    if(row.arrivalAt!==arrivalAt){
      if(row.updatedAt!==input.expectedUpdatedAt)throw Error('다른 화면에서 기록이 변경됐습니다. 창을 닫고 다시 확인해주세요.');
      row.arrivalAt=arrivalAt;row.updatedAt=at;
    }
  } else if(input.action==='manageCourse'){
    const row=data.students.find(s=>s.id===input.studentId);const group=String(input.group);if(!row||!REGISTRATION_SUBJECTS.includes(group))throw Error('과목을 확인해주세요.');
    const subject=group.includes('피아노')?'피아노':group;const siblings=data.students.filter(s=>(s.sourceStudentId||s.id)===(row.sourceStudentId||row.id));
    if(siblings.some(s=>(input.mode==='add'||s.id!==row.id)&&(s.instruments?.[0]?.includes('피아노')?'피아노':s.instruments?.[0])===subject))throw Error('이미 등록된 과목입니다.');
    if(input.mode==='add')data.students.push({...row,id:`demo-course-${crypto.randomUUID()}`,subject,name:`${row.name.split(' · ')[0]} · ${subject}`,instruments:[subject],attendanceGroup:group});
    else{row.attendanceGroup=group;row.instruments=[subject];row.name=`${row.name.split(' · ')[0]} · ${subject}`;if(account)account.name=row.name;}
  } else if(input.action === 'correctRemaining'){
    if(!account)throw Error('먼저 수강 등록을 해주세요.');
    if(account.updatedAt!==input.expectedUpdatedAt||account.remaining!==input.expectedRemaining)throw Error('잔여 횟수가 변경됐습니다. 다시 열어주세요.');
    account.remaining=integer(input.remaining,-1000,1000,'남은 횟수');account.updatedAt=at;
    const existing=data.invoices.find(i=>i.id===account.openInvoiceId);
    if(existing)existing.needsReview=true;
    else if(account.remaining<=0){const auto=account.autoBilling;account.autoBilling=false;invoice(account);account.autoBilling=auto;}
  } else if(input.action === 'deleteEnrollment' || input.action === 'restoreEnrollment'){
    const row=data.students.find(s=>s.id===input.studentId && (s.sourceStudentId||s.id)===input.sourceStudentId);
    if(!row)throw Error('학생을 찾을 수 없습니다.');
    row.lifecycle=deleteOrRestoreEnrollment(row.lifecycle,input,at);
  } else if(input.action === 'changeLifecycle'){
    const values=lifecycleInput(input);const rows=data.students.filter(s=>s.id===input.studentId && (s.sourceStudentId||s.id)===input.sourceStudentId);
    if(!rows.length)throw Error('학생을 찾을 수 없습니다.');
    if(rows[0].lifecycle?.deletedAt)throw Error('삭제된 항목에서 먼저 복원해주세요.');
    if((rows[0].lifecycle?.updatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('학생 상태가 변경됐습니다.');
    for(const row of rows)row.lifecycle={...values,updatedAt:at};
  } else if (input.action === 'registerStudent') {
    const v=registrationInput(input);const id=`demo-new-${input.requestId}`;
    if(data.accounts.some(a=>a.id===id))return {data,result:{ok:true,duplicate:true}};
    if(data.students.some(s=>s.name.split(' · ')[0].replace(/\s/g,'')===v.name.replace(/\s/g,'')&&s.phone.replace(/\D/g,'')===v.phone))throw Error('이미 등록된 학생입니다.');
    const a:Account={id,sourceStudentId:id,subject:v.subject,name:`${v.name} · ${v.subject}`,phone:v.phone,checkinSuffixes:[...new Set([v.phone.slice(-4),...(v.personalPhone?[v.personalPhone.slice(-4)]:[])])],planUnits:v.planUnits,planAmount:v.planAmount,remaining:v.remaining,openInvoiceId:null,autoBilling:false,active:true,updatedAt:at};
    const firstInvoice=firstEnrollmentInvoice(a,v.firstLessonDate,at);a.openInvoiceId=firstInvoice.id;data.invoices.push(firstInvoice);
    data.sequenceContext ||= {positions:{},cycleStarts:[]};data.sequenceContext.cycleStarts.push({studentId:id,day:v.firstLessonDate});
    data.accounts.push(a);data.students.push({id,name:a.name,phone:v.phone,sourceStudentId:id,subject:v.subject,instruments:[v.subject],attendanceGroup:v.group});
  } else if (input.action === 'recordAttendanceRange') {
    if(!account)throw Error('먼저 수강 설정을 저장해주세요.');
    const changes=rangeAttendance(input,account,data.attendance.filter(r=>r.studentId===account.id),new Set((data.legacyAttendance||[]).filter(r=>r.studentId===account.id).map(r=>r.day)),at);
    const ids=new Set(changes.map(r=>r.id));data.attendance=[...data.attendance.filter(r=>!ids.has(r.id)),...changes];
  } else if (input.action === 'recordAttendance') {
    const values = attendanceInput(input);
    if (!account) throw new Error('먼저 수강 설정을 저장해주세요.');
    const id = `${account.id}_${values.day}`; const old = data.attendance.find(a => a.id === id);
    if(values.status==='makeup_reserved'||(old?.status==='makeup_reserved'&&values.status==='makeup')) {
      if(values.status==='makeup_reserved'&&old&&(old.units>0||['present','makeup'].includes(old.status||'present')))throw Error('이미 출석한 날짜입니다. 출석 기록을 먼저 취소해주세요.');
      const source=data.attendance.find(r=>r.studentId===account.id&&r.day===values.relatedDay), imported=data.legacyAttendance?.find(r=>r.studentId===account.id&&r.day===values.relatedDay);
      const originalStatus=source?.status || (imported?legacyAttendanceAppearance(imported).tone:'');
      if(!['absent','travel','sick','late_cancel'].includes(originalStatus))throw Error('원래 날짜의 결석·여행 기록을 확인해주세요.');
      if(data.attendance.some(r=>r.id!==id&&r.studentId===account.id&&r.relatedDay===values.relatedDay&&['makeup','makeup_reserved'].includes(r.status||'')))throw Error('이 수업의 보강이 이미 예약되었거나 완료되었습니다.');
      if(values.status==='makeup'&&(source?.units||0)>0)values.units=0;
    }
    account.remaining = adjustBalance(account.remaining, old?.units || 0, values.units);
    data.attendance = data.attendance.filter(a => a.id !== id);
    data.attendance.push({ ...old, ...values, id, studentId: account.id, name: account.name, at: old?.at || at, source: old?.source || 'manual', updatedAt: at });
    delete data.attendance[data.attendance.length-1].range;
    if (account.remaining <= 0 && values.units > (old?.units || 0)) invoice(account);
    if (account.remaining > 0 && values.units < (old?.units || 0)) { const open = data.invoices.find(i => i.id === account.openInvoiceId); if (open) open.needsReview = true; }
  } else if (input.action === 'demoCheckIn') {
    if (!account?.active || enrollmentState(data.students.find(s=>s.id===account.id)?.lifecycle)!=='active') throw new Error('학생 설정을 확인해주세요.');
    const existing = data.attendance.find(a => a.studentId === account.id && a.day === seoulDay());
    if (existing?.status && existing.status !== 'cancelled' && existing.status !== 'present' && existing.status !== 'makeup' && existing.status !== 'makeup_reserved') throw new Error('오늘 결석·취소 기록이 있습니다. 선생님께 출석 변경을 요청해주세요.');
    if (existing && existing.status !== 'cancelled' && existing.status !== 'makeup_reserved') return { data, result: { duplicate: true, name: checkInName(account, {}) } };
    const id = `${account.id}_${seoulDay()}`;
    const reservation=existing?.status==='makeup_reserved'?existing:undefined;
    const original=reservation?data.attendance.find(r=>r.studentId===account.id&&r.day===reservation.relatedDay):undefined;
    const imported=reservation?data.legacyAttendance?.find(r=>r.studentId===account.id&&r.day===reservation.relatedDay):undefined;
    if(reservation&&!['absent','travel','sick','late_cancel'].includes(original?.status||(imported?legacyAttendanceAppearance(imported).tone:'')))throw Error('원래 날짜의 결석·여행 기록을 확인해주세요.');
    const units=(original?.units||0)>0?0:1;
    account.remaining = adjustBalance(account.remaining, 0, units);
    data.attendance=data.attendance.filter(r=>r.id!==id);
    data.attendance.unshift({ id, studentId: account.id, name: account.name, day: seoulDay(), at, units, status: reservation?'makeup':'present', source: 'kiosk', note: reservation?.note||'', ...(reservation?{relatedDay:reservation.relatedDay}:{}), updatedAt: at });
    if(!data.notices.some(n=>n.id===`attendance_${id}`))enqueue(account, `attendance_${id}`, 'attendance'); if (account.remaining <= 0 && units>0) invoice(account);
    result = { name: checkInName(account, {}), duplicate: false };
  } else if (input.action === 'configure') {
    if(Object.hasOwn(input,'expectedUpdatedAt')&&(account?.updatedAt||'')!==input.expectedUpdatedAt)throw Error('수강 정보가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    if(Object.hasOwn(input,'expectedOpenInvoiceId')&&(account?.openInvoiceId||'')!==input.expectedOpenInvoiceId)throw Error('연결된 청구가 변경됐습니다. 창을 닫고 다시 확인해주세요.');
    const linked=data.invoices.find(i=>i.id===account?.openInvoiceId);
    if(linked&&(input.syncOpenInvoice===true||account?.planUnits!==input.planUnits||account?.planAmount!==input.planAmount)){
      if(Object.hasOwn(input,'expectedInvoiceUpdatedAt')&&(linked.updatedAt||'')!==input.expectedInvoiceUpdatedAt)throw Error('청구 내용이 변경됐습니다. 창을 닫고 다시 확인해주세요.');
      const revised=invoiceForPlan(linked,String(input.studentId),Number(input.planUnits),Number(input.planAmount),at);
      if(revised)Object.assign(linked,revised);
    }
    const student = data.students.find(s => s.id === input.studentId)!;
    const next: Account = { ...(account?.schedule?{schedule:account.schedule}:{}), id: student.id, sourceStudentId: student.sourceStudentId, subject: student.subject, name: student.name, phone: String(input.phone), checkinSuffixes: suffixes(input.phones), planUnits: Number(input.planUnits), planAmount: Number(input.planAmount), remaining: account?.remaining ?? Number(input.remaining), openInvoiceId: account?.openInvoiceId || null, active: input.active !== false, autoBilling: input.autoBilling === true, updatedAt: at };
    if(!account&&input.firstBilling===true){const firstInvoice=firstEnrollmentInvoice(next,validDay(input.firstLessonDate),at);next.openInvoiceId=firstInvoice.id;data.invoices.push(firstInvoice);data.sequenceContext||={positions:{},cycleStarts:[]};data.sequenceContext.cycleStarts.push({studentId:next.id,day:firstInvoice.cycleStart!});}
    data.accounts = [...data.accounts.filter(a => a.id !== student.id), next];
  } else if(input.action==='currentCycleInvoice'){
    if(!account || account.openInvoiceId)throw Error('수강권과 기존 청구를 확인해주세요.');
    const cycleStart=input.kind==='first'&&!input.cycleStart?'':validDay(input.cycleStart);if(cycleStart>seoulDay()&&input.kind!=='first')throw Error('재등록일을 확인해주세요.');
    const id=input.kind==='first'?`first_${account.id}`:crypto.randomUUID();
    if([...data.invoices,...(data.settledInvoices||[])].some(i=>i.id===id))throw Error('첫 수강권의 청구가 이미 있습니다.');
    account.openInvoiceId=id;
    data.sequenceContext ||= {positions:{},cycleStarts:[]};
    if(cycleStart)data.sequenceContext.cycleStarts.push({studentId:account.id,day:cycleStart});
    data.invoices.push({id,studentId:account.id,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:at,creditUnits:0,...(cycleStart?{cycleStart}:{})});
  } else if (input.action === 'linkInvoiceLesson') {
    const invoice=data.invoices.find(i=>i.id===input.invoiceId),lessonDate=validDay(input.lessonDate);
    if(!invoice||invoice.status!=='open')throw Error('진행 중인 청구를 확인해주세요.');
    if((invoice.updatedAt||'')!==(input.expectedUpdatedAt||''))throw Error('청구 내용이 변경됐습니다.');
    if([...data.invoices,...(data.settledInvoices||[])].some(i=>i.id!==invoice.id&&i.studentId===invoice.studentId&&i.status!=='cancelled'&&(i.lessonDate||i.cycleStart)===lessonDate))throw Error('이 1회차 날짜에 연결된 다른 청구가 있습니다.');
    invoice.lessonDate=lessonDate;invoice.updatedAt=at;
  } else if (input.action === 'invoice') { if (!account) throw new Error('수강 설정을 저장해주세요.'); if (account.openInvoiceId) throw new Error('진행 중인 청구가 있습니다.'); invoice(account); }
  else if (input.action === 'adjust') {
    const attendance = data.attendance.find(a => a.id === input.attendanceId)!;
    const a = data.accounts.find(a => a.id === attendance.studentId)!;
    a.remaining = adjustBalance(a.remaining, attendance.units, Number(input.units)); attendance.units = Number(input.units); attendance.note = String(input.note || '').trim().slice(0, 500);
    if (a.remaining <= 0) invoice(a);
    else { const open = data.invoices.find(i => i.id === a.openInvoiceId); if (open) open.needsReview = true; }
  } else if (input.action === 'payment') {
    const paymentDate = paymentDateInput(input.paymentDate);
    const existing = data.payments.find(p => p.id === input.requestId);
    if (existing) { if(existing.invoiceId!==input.invoiceId || existing.amount!==Number(input.amount) || existing.method!==input.method || (input.paymentDate!==undefined && existing.paymentDate!==paymentDate))throw Error('중복 요청 내용이 다릅니다.');return { data, result }; }
    const i = data.invoices.find(i => i.id === input.invoiceId)!; const s = settle(i, Number(input.amount));
    i.paid = s.paid;
    if (s.complete) { i.status = 'paid'; const a = data.accounts.find(a => a.id === i.studentId)!; a.remaining += i.creditUnits ?? i.units; a.openInvoiceId = null; }
    data.payments.unshift({ id: String(input.requestId), invoiceId: i.id, studentId: i.studentId, amount: Number(input.amount), method: String(input.method), paymentDate, at, note: String(input.note || '') });
  } else if (['sendInvoice', 'cancelInvoice', 'confirmInvoice'].includes(String(input.action))) {
    const i = data.invoices.find(i => i.id === input.invoiceId)!;
    if (input.action === 'confirmInvoice') i.needsReview = false;
    else if (input.action === 'cancelInvoice') { if (i.paid) throw new Error('수납된 청구는 취소할 수 없습니다.'); i.status = 'cancelled'; data.accounts.find(a => a.id === i.studentId)!.openInvoiceId = null; }
    else { if (i.needsReview) throw new Error('청구 내용을 확인해주세요.'); if (data.notices.some(n => n.id === `billing_${i.id}`)) throw new Error('이미 요청 기록이 있습니다.'); enqueue(data.accounts.find(a => a.id === i.studentId)!, `billing_${i.id}`, 'billing'); }
  } else if (input.action === 'pair') result = { code: '체험에서는 실제 기기를 등록하지 않습니다.' };
  else if (input.action === 'process') result = { submitted: 0 };
  data.settledInvoices = [...(data.settledInvoices || []), ...data.invoices.filter(i => i.status === 'paid')];
  data.invoices = data.invoices.filter(i => i.status === 'open');
  return { data, result };
}
