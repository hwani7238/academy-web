import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve('src/lib/operations');
test('future leave ranges are atomic, idempotent, course-scoped and do not charge or send notices',async()=>{
 const s=setup();await s.seed('piano',8);await s.seed('drums',4);
 const input={studentId:'piano',start:'2998-12-30',end:'2999-01-02',status:'travel',rangeId:'trip-1',note:'가족 여행',revisions:{}};
 const before=structuredClone(s.records.get('opsAccounts/piano'));
 const result=await s.service.recordAttendanceRange(input,'owner');assert.equal(result.attendance.length,4);
 for(const r of result.attendance){assert.equal(r.status,'travel');assert.equal(r.units,0);assert.equal(r.range.id,'trip-1');}
 await s.service.recordAttendanceRange(input,'owner');
 assert.equal([...s.records.values()].filter(r=>r.action==='attendance-range').length,1);
 assert.deepEqual(s.records.get('opsAccounts/piano'),before);assert.equal(s.records.get('opsAccounts/drums').remaining,4);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')||k.startsWith('opsInvoices/')).length,0);
 const day='2999-01-01',old=s.records.get(`opsAttendance/piano_${day}`);
 await s.service.recordAttendance({studentId:'piano',day,status:'sick',units:0,expectedUpdatedAt:old.updatedAt},'owner');
 assert.equal(s.records.get(`opsAttendance/piano_${day}`).range,undefined);
 await s.service.recordAttendanceRange({...input,status:'cancelled'},'owner');
 assert.equal(s.records.get(`opsAttendance/piano_${day}`).status,'sick');
 assert.equal(s.records.get('opsAttendance/piano_2998-12-30').status,'cancelled');
 await s.service.recordAttendanceRange({...input,status:'cancelled'},'owner');
 assert.equal([...s.records.values()].filter(r=>r.action==='attendance-range').length,2);
});
test('range conflicts reject every write and preserve charged and imported records',async()=>{
 const s=setup();await s.seed('student-a',8);
 const input={studentId:'student-a',start:'2026-09-01',end:'2026-09-03',status:'absent',rangeId:'absence-1',revisions:{}};
 await s.service.recordAttendance({studentId:'student-a',day:'2026-09-02',status:'present',units:1},'owner');
 await assert.rejects(s.service.recordAttendanceRange(input,'owner'),/출석/);
 assert.equal(s.records.has('opsAttendance/student-a_2026-09-01'),false);assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 const r=s.records.get('opsAttendance/student-a_2026-09-02');
 await s.service.recordAttendance({studentId:'student-a',day:r.day,status:'cancelled',units:0,expectedUpdatedAt:r.updatedAt},'owner');
 await assert.rejects(s.service.recordAttendanceRange(input,'owner'),/변경/);
 const revision=s.records.get('opsAttendance/student-a_2026-09-02').updatedAt;
 s.records.get('opsAccounts/student-a').importId='import-a';
 s.records.set('opsImports/import-a',{matchedStudentId:'student-a',asOf:'2026-09-03',history:[{cells:[{day:'2026-09-03',value:'3'}]}]});
 await assert.rejects(s.service.recordAttendanceRange({...input,revisions:{'2026-09-02':revision}},'owner'),/이전 장부/);
 assert.equal(s.records.has('opsAttendance/student-a_2026-09-01'),false);
 for(const patch of [{start:'invalid'},{end:'2026-08-31'},{end:'2027-09-01'},{status:'present'},{rangeId:''}])await assert.rejects(s.service.recordAttendanceRange({...input,...patch},'owner'));
});
test('cancelled leave and mistaken attendance allow checking in again without duplicate notices',async()=>{
 const s=setup();await s.seed('student-a',8);const day=s.load('model').seoulDay();
 await s.service.recordAttendance({studentId:'student-a',day,status:'travel',units:0},'owner');
 let old=s.records.get(`opsAttendance/student-a_${day}`);
 await s.service.recordAttendance({studentId:'student-a',day,status:'cancelled',units:0,expectedUpdatedAt:old.updatedAt},'owner');
 await s.service.checkIn('student-a','1234','device');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 old=s.records.get(`opsAttendance/student-a_${day}`);
 await s.service.recordAttendance({studentId:'student-a',day,status:'cancelled',units:0,expectedUpdatedAt:old.updatedAt},'owner');
 await s.service.checkIn('student-a','1234','device');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/attendance_')).length,1);
});
test('lesson sequence follows imported counts, rolls per course and recalculates corrections chronologically',()=>{
 const {attendanceSequence: sequence}=setup().load('attendance-sequence');
 const accounts=[{id:'piano',planUnits:8},{id:'drums',planUnits:4}];
 const legacy=[{studentId:'piano',day:'2026-09-18',value:'5',color:''},{studentId:'piano',day:'2026-09-19',value:'6',color:'FFCCCCCC'}];
 const row=(studentId,day,units=1,status='present')=>({studentId,day,units,status});
 const records=[row('piano','2026-09-30'),row('piano','2026-09-20'),row('piano','2026-09-22',0,'absent'),row('piano','2026-09-23',2,'makeup'),row('drums','2026-09-20')];
 const result=sequence(accounts,records,legacy);
 assert.equal(result.labels.get('piano_2026-09-20'),'7');
 assert.equal(result.labels.has('piano_2026-09-23'),false);
 assert.equal(result.labels.get('piano_2026-09-30'),'1');
 assert.equal(result.labels.get('piano_2026-09-22'),'8');
 assert.equal(result.labels.get('drums_2026-09-20'),'1');
 const cancelled=records.map(r=>r.day==='2026-09-20'&&r.studentId==='piano'?{...r,units:0,status:'cancelled'}:r);
 assert.equal(sequence(accounts,cancelled,legacy).labels.get('piano_2026-09-30'),'8');
 // A backdated lesson updates later numbers; input array order does not matter.
 assert.equal(sequence(accounts,[...records,row('piano','2026-09-21')],legacy).labels.get('piano_2026-09-30'),'2');
 // Makeup never advances the regular sequence; illness and late cancellation reserve a slot.
 const extra=[row('drums','2026-09-21',0,'makeup'),row('drums','2026-09-22',0,'sick'),row('drums','2026-09-23',1,'late_cancel')];
 assert.equal(sequence(accounts,[...records,...extra],legacy).labels.get('drums_2026-09-23'),'3');
});
test('lesson sequence carries across months and explicit renewal dates, independent of payments and balances',()=>{
 const {attendanceSequence: sequence}=setup().load('attendance-sequence');
 const accounts=[{id:'p',planUnits:8,remaining:100}];
 const prior=sequence(accounts,[{studentId:'p',day:'2026-09-30',units:1}], [{studentId:'p',day:'2026-09-29',value:'5',color:''}]);
 const rows=[{studentId:'p',day:'2026-10-01',units:1},{studentId:'p',day:'2026-10-03',units:1}];
 const context={positions:prior.positions,cycleStarts:[{studentId:'p',day:'2026-10-02'}]};
 const result=sequence(accounts,rows,[],context);
 assert.equal(result.labels.get('p_2026-10-01'),'7');
 assert.equal(result.labels.get('p_2026-10-03'),'2');
 assert.equal(sequence(accounts,[{studentId:'p',day:'2026-10-02',units:1},...rows],[],context).labels.get('p_2026-10-03'),'2');
 assert.deepEqual(sequence([{...accounts[0],remaining:0}],rows,[],context),result);
 assert.equal(context.positions.p,6);
 // A modern cancelled record overrides an imported cell on the same date.
 assert.equal(sequence(accounts,[{studentId:'p',day:'2026-09-29',units:0,status:'cancelled'},rows[0]], [{studentId:'p',day:'2026-09-29',value:'5',color:''}]).labels.get('p_2026-10-01'),'1');
});
test('student rename updates all owned course accounts while keeping identities, balances and historical records',async()=>{
 const s=setup();
 s.records.set('students/person',{name:'기존 이름',instruments:['피아노','드럼'],phone:'01000001234'});
 const ids=['피아노','드럼'].map(subject=>s.service.enrollmentId('person',subject));
 for(const [i,subject] of ['피아노','드럼'].entries())await s.service.configure({studentId:ids[i],sourceStudentId:'person',subject,planUnits:8,planAmount:160000,remaining:6-i,phone:'01000001234',phones:['1234'],active:true},'owner');
 await s.seed('other',4);
 const before=ids.map(id=>structuredClone(s.records.get(`opsAccounts/${id}`))),other=structuredClone(s.records.get('opsAccounts/other'));
 s.records.set('opsAttendance/past',{id:'past',studentId:ids[0],name:'기존 이름 · 피아노',units:1});
 const input={studentId:ids[0],sourceStudentId:'person',name:'새 이름',expectedName:'기존 이름',expectedUpdatedAt:''};
 await s.service.renameStudent(input,'owner');
 assert.equal(s.records.get('students/person').name,'새 이름');
 for(const [i,id] of ids.entries()){
  const a=s.records.get(`opsAccounts/${id}`);assert.equal(a.name,`새 이름 · ${before[i].subject}`);
  for(const field of ['id','sourceStudentId','subject','remaining','planUnits','planAmount','phone','openInvoiceId'])assert.deepEqual(a[field],before[i][field]);
 }
 assert.deepEqual(s.records.get('opsAccounts/other'),other);
 assert.equal(s.records.get('opsAttendance/past').name,'기존 이름 · 피아노');
 await s.service.renameStudent(input,'owner');
 assert.equal([...s.records.values()].filter(v=>v.action==='rename-student').length,1);
 await assert.rejects(s.service.renameStudent({...input,name:'다른 이름'},'owner'));
 await assert.rejects(s.service.renameStudent({...input,studentId:'other',name:'잘못된 학생'},'owner'));
 for(const name of ['', ' '.repeat(3), '가'.repeat(101),'줄\n바꿈'])await assert.rejects(s.service.renameStudent({...input,name},'owner'));
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')||k.startsWith('opsPayments/')).length,0);
});
test('student rename also works before course setup and for legacy single accounts',async()=>{
 const s=setup();s.records.set('students/unconfigured',{name:'미설정',instruments:['피아노']});
 await s.service.renameStudent({sourceStudentId:'unconfigured',studentId:s.service.enrollmentId('unconfigured','피아노'),name:'이름 정정',expectedName:'미설정'},'owner');
 assert.equal(s.records.get('students/unconfigured').name,'이름 정정');
 await s.seed('legacy',7);
 await s.service.renameStudent({sourceStudentId:'legacy',studentId:'legacy',name:'통합 학생',expectedName:'가상 학생'},'owner');
 assert.equal(s.records.get('opsAccounts/legacy').name,'통합 학생');assert.equal(s.records.get('opsAccounts/legacy').remaining,7);
});
test('daily attendance toggles arrival direction and Korean names using corrected times with unknown times last',()=>{
 const s=setup(),{orderDailyAttendance}=s.load('attendance-order');
 const base={day:'2026-09-29',at:'2026-09-29T05:00:00Z',status:'present',source:'kiosk'};
 const rows=[{...base,id:'hong',name:'홍길동',arrivalAt:'2026-09-29T01:00:00Z'},{...base,id:'kim',name:'김가람'},{...base,id:'kang',name:'강하늘',at:'2026-09-29T06:00:00Z'},{...base,id:'manual',name:'가나다',source:'manual'},{...base,id:'invalid',name:'나나',at:'invalid'}];
 const ids=order=>orderDailyAttendance(rows,order).map(r=>r.id);
 assert.deepEqual(ids('earliest'),['hong','kim','kang','manual','invalid']);
 assert.deepEqual(ids('latest'),['kang','kim','hong','manual','invalid']);
 assert.deepEqual(ids('name'),['manual','kang','kim','invalid','hong']);
 assert.equal(rows[0].id,'hong');
 assert.deepEqual(orderDailyAttendance([{...base,id:'b',name:'동명'},{...base,id:'a',name:'동명'}],'latest').map(r=>r.id),['a','b']);
});
test('attendance time correction preserves attendance day, source, units, balance and original timestamp',async()=>{
 const s=setup();await s.seed('student-a',8);
 const day=s.load('model').seoulDay();
 await s.service.recordAttendance({studentId:'student-a',day,status:'present',units:2,note:'기존 비고'},'owner');
 const id=`student-a_${day}`,before=structuredClone(s.records.get(`opsAttendance/${id}`)),account=structuredClone(s.records.get('opsAccounts/student-a'));
 const input={attendanceId:id,time:'00:05',expectedUpdatedAt:before.updatedAt};
 const result=await s.service.correctAttendanceTime(input,'owner');
 const row=result.attendance[0];
 assert.equal(row.at,before.at);assert.equal(row.day,day);assert.equal(row.source,'manual');assert.equal(row.units,2);assert.equal(row.note,'기존 비고');
 assert.equal(s.load('attendance-time').attendanceClock(row),'00:05');
 assert.ok(s.load('attendance-order').arrivalsOnDay({attendance:[row]},day).get('student-a').time);
 assert.deepEqual(s.records.get('opsAccounts/student-a'),account);
 await s.service.correctAttendanceTime(input,'owner');
 await assert.rejects(s.service.correctAttendanceTime({...input,time:'12:34',expectedUpdatedAt:'stale'},'owner'));
 for(const time of ['24:00','12:60','3:10','',null,'12:30:00'])await assert.rejects(s.service.correctAttendanceTime({...input,time,expectedUpdatedAt:row.updatedAt},'owner'));
 await assert.rejects(s.service.correctAttendanceTime({...input,attendanceId:'missing'},'owner'));
 const audit=[...s.records].filter(([k,v])=>k.startsWith('opsAudit/')&&v.action==='correct-attendance-time');
 assert.equal(audit.length,1);assert.equal(audit[0][1].detail.before,before.at);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')||k.startsWith('opsInvoices/')||k.startsWith('opsPayments/')).length,0);
 assert.equal(s.load('attendance-time').attendanceClock(before),'');
 assert.equal(s.load('attendance-time').attendanceClock({...before,source:'kiosk',at:new Date(`${day}T15:20:00+09:00`).toISOString()}),'15:20');
});
test('monthly roster sorts all rows by Korean name or payment priority without merging courses',()=>{
 const s=setup(),{arrivalsOnDay,orderAttendanceStudents}=s.load('attendance-order');
 const students=Array.from({length:195},(_,i)=>({id:`s${i}`,name:`학생${i}`,phone:''}));
 students[0].name='홍길동 · 피아노';students[1].name='강하늘 · 보컬';students[2].name='김가람 · 드럼';students[3].name='김가람 · 피아노';
 const day='2026-09-29';
 const record=(id,status,at,source='kiosk')=>({studentId:id,day,status,at,source});
 const arrivals=arrivalsOnDay({attendance:[record('s0','present','2026-09-29T05:00:00Z'),record('s2','makeup','2026-09-29T04:00:00Z'),record('s3','cancelled','2026-09-29T03:00:00Z'),record('s4','absent','2026-09-29T02:00:00Z'),record('s5','present','2026-09-29T01:00:00Z','manual'),{...record('s6','present','2026-09-28T01:00:00Z'),day:'2026-09-28'}],legacyAttendance:[{studentId:'s3',day,value:'3',color:''},{studentId:'s7',day,value:'2',color:'FFCCCCCC'},{studentId:'s8',day,value:'2',color:'FFFF00FF'},{studentId:'s9',day,value:'병가',color:''}]},day);
 assert.deepEqual([...arrivals.keys()],['s0','s2','s5','s8']);
 assert.equal(arrivals.get('s5').time,undefined);
 const paymentDue=new Set(['s0','s2']);
 const ordered=orderAttendanceStudents(students,'payment',paymentDue);
 assert.equal(ordered.length,195);assert.deepEqual(ordered.slice(0,3).map(s=>s.id),['s2','s0','s1']);
 assert.ok(ordered.findIndex(s=>s.id==='s3')>2);
 assert.equal(orderAttendanceStudents(students,'name',paymentDue)[0].id,'s1');
 assert.equal(students[0].id,'s0');
 assert.equal(arrivalsOnDay({attendance:[record('s0','present','invalid')],legacyAttendance:[]},day).get('s0').time,undefined);
});
test('attendance cancellation restores all deducted units once, preserves history and rejects stale edits',async()=>{
 const s=setup();await s.seed('student-a',2);
 const day=s.load('model').seoulDay();
 await s.service.recordAttendance({studentId:'student-a',day,status:'present',units:2,note:'',expectedUpdatedAt:''},'owner');
 const id=`student-a_${day}`,before=s.records.get(`opsAttendance/${id}`);
 const input={studentId:'student-a',day,status:'cancelled',units:0,note:'잘못 선택',expectedUpdatedAt:before.updatedAt};
 const cancelled=await s.service.recordAttendance(input,'owner');
 assert.equal(cancelled.accounts[0].remaining,2);
 assert.equal(cancelled.attendance[0].status,'cancelled');
 assert.equal(cancelled.attendance[0].at,before.at);
 assert.equal(cancelled.attendance[0].note,'잘못 선택');
 assert.equal(cancelled.invoices[0].needsReview,true);
 await s.service.recordAttendance(input,'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,2);
 await assert.rejects(s.service.recordAttendance({...input,status:'present',units:1,expectedUpdatedAt:'stale'},'owner'));
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,0);
});
test('check-in labels use the registered piano group and preserve separate siblings',()=>{
 const s=setup(),{checkInName}=s.load('course-label');
 const a={name:'가상 유민 · 피아노',subject:'피아노'};
 assert.equal(checkInName({...a,attendanceGroup:'어린이 피아노(1관)'},{}),'가상 유민 · 어린이 피아노 (1관)');
 assert.equal(checkInName({...a,attendanceGroup:'어린이 피아노(1관)'},{operationsCourseGroups:{피아노:'어린이 피아노(2관)'}}),'가상 유민 · 어린이 피아노 (2관)');
 assert.equal(checkInName({...a,subject:'성인 피아노'},{}),'가상 유민 · 성인 피아노');
 const source={subject:'어린이 피아노',asOf:'2026-09-23',history:[{section:'피아노(어린이)2관',cells:[{day:'2026-08-01'}]},{section:'피아노(어린이)',cells:[{day:'2026-09-01'}]}]};
 assert.equal(checkInName(a,{},source),'가상 유민 · 어린이 피아노 (1관)');
 assert.equal(checkInName({...a,name:'가상 유나 · 어린이 피아노',subject:'어린이 피아노'},{},source),'가상 유나 · 어린이 피아노 (1관)');
 source.history.push({section:'피아노(어린이)2관',cells:[{day:'2026-09-02'}]});
 assert.equal(checkInName(a,{},source),'가상 유민 · 피아노 · 반 확인 필요');
 assert.equal(checkInName({...a,subject:'드럼',name:'가상 유민 · 드럼'},{}),'가상 유민 · 드럼');
});
test('check-in success and duplicate responses use the same imported campus without extra deductions',async()=>{
 const s=setup();await s.seed('student-a',6);
 const account=s.records.get('opsAccounts/student-a');
 Object.assign(account,{name:'가상 학생 · 피아노',subject:'피아노',importId:'source'});
 s.records.set('opsImports/source',{matchedStudentId:'student-a',subject:'어린이 피아노',asOf:'2026-09-23',history:[{section:'피아노(어린이)2관',cells:[{day:'2026-09-01'}]}]});
 const result=await s.service.checkIn('student-a','1234','device');
 assert.equal(result.name,'가상 학생 · 어린이 피아노 (2관)');
 assert.equal((await s.service.checkIn('student-a','1234','device')).name,result.name);
 assert.equal(s.records.get('opsAccounts/student-a').remaining,5);
});
test('pause and withdrawal preserve balances; expiry and reinstatement restore check-in',async()=>{
 const s=setup();await s.seed('student-a',8);const today=s.load('model').seoulDay();
 await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'paused',until:today,expectedUpdatedAt:''},'owner');
 const life=s.records.get('students/student-a').courseLifecycles['student-a'];
 assert.equal(s.load('lifecycle').enrollmentState(life,today),'paused');
 const tomorrow=new Date(today);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 assert.equal(s.load('lifecycle').enrollmentState(life,tomorrow.toISOString().slice(0,10)),'active');
 await assert.rejects(s.service.checkIn('student-a','1234','device'));
 await assert.rejects(s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'active',expectedUpdatedAt:''},'owner'));
 await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'withdrawn',expectedUpdatedAt:life.updatedAt},'owner');
 await assert.rejects(s.service.checkIn('student-a','1234','device'));
 assert.equal(s.records.get('opsAccounts/student-a').remaining,8);
 await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'active',expectedUpdatedAt:s.records.get('students/student-a').courseLifecycles['student-a'].updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,8);
 await s.service.checkIn('student-a','1234','device');assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
});
test('new registration creates exactly one first invoice and keeps lessons unchanged when it is paid',async()=>{
 const s=setup();const input={requestId:'request-new',name:'신규 학생',phone:'010-0000-1234',personalPhone:'010-0000-5678',group:'어린이 피아노(2관)',planUnits:8,planAmount:170000,remaining:8,firstLessonDate:'2026-10-01'};
 const results=await Promise.all([s.service.registerStudent(input,'owner'),s.service.registerStudent(input,'owner')]);
 assert.equal(results.filter(r=>r.duplicate).length,1);
 const students=[...s.records].filter(([k])=>k.startsWith('students/'));assert.equal(students.length,1);
 assert.equal(students[0][1].status,'등록');assert.equal(students[0][1].phoneLast4,'1234');
 const a=s.records.get(`opsAccounts/${results[0].studentId}`);assert.equal(a.attendanceGroup,'어린이 피아노(2관)');assert.equal(a.remaining,8);assert.deepEqual(a.checkinSuffixes,['1234','5678']);
 const invoice=s.records.get(`opsInvoices/${a.openInvoiceId}`);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 assert.equal(invoice.amount,170000);assert.equal(invoice.units,8);assert.equal(invoice.creditUnits,0);assert.equal(invoice.cycleStart,input.firstLessonDate);assert.equal(invoice.status,'open');
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsPayments/')||k.startsWith('opsNotices/')),false);
 await assert.rejects(s.service.registerStudent({...input,requestId:'other'},'owner'));
 await assert.rejects(s.service.registerStudent({...input,planAmount:190000},'owner'));
 await s.service.payment({invoiceId:invoice.id,requestId:'new-partial',amount:70000,method:'현금'},'owner');
 assert.equal(s.records.get(`opsAccounts/${a.id}`).remaining,8);
 await s.service.checkIn(a.id,'5678','device');assert.equal(s.records.get(`opsAccounts/${a.id}`).remaining,7);
 const payment={invoiceId:invoice.id,requestId:'new-final',amount:100000,method:'카드'};
 await Promise.all([s.service.payment(payment,'owner'),s.service.payment(payment,'owner')]);
 assert.equal(s.records.get(`opsAccounts/${a.id}`).remaining,7);assert.equal(s.records.get(`opsAccounts/${a.id}`).openInvoiceId,null);
 assert.equal(s.records.get(`opsInvoices/${invoice.id}`).status,'paid');
 await s.service.registerStudent(input,'owner');
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
});
test('first configuration of an existing student can create a first invoice without duplicate credit or messages',async()=>{
 const s=setup();s.records.set('students/new-course',{name:'새 수강생',phone:'01000001234'});
 const input={studentId:'new-course',planUnits:12,planAmount:180000,remaining:12,phone:'01000001234',phones:['1234'],active:true,autoBilling:true,firstBilling:true,firstLessonDate:'2999-01-02'};
 await Promise.all([s.service.configure(input,'owner'),s.service.configure(input,'owner')]);
 const a=s.records.get('opsAccounts/new-course'),invoice=s.records.get(`opsInvoices/${a.openInvoiceId}`);
 assert.equal(invoice.cycleStart,'2999-01-02');assert.equal(invoice.creditUnits,0);assert.equal(invoice.amount,180000);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
 await s.service.editInvoice({invoiceId:invoice.id,kind:'current',cycleStart:'2999-01-03',units:12,amount:180000},'owner');
 const revised=s.records.get(`opsInvoices/${invoice.id}`);assert.equal(revised.cycleStart,'2999-01-03');assert.equal(revised.creditUnits,0);
 await s.service.payment({invoiceId:invoice.id,requestId:'new-course-paid',amount:180000,method:'현금',expectedInvoiceUpdatedAt:revised.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/new-course').remaining,12);
 await s.service.configure(input,'owner');
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 s.records.set('students/old-paid',{name:'기존 수납 학생',phone:'01000005678'});
 await s.service.configure({...input,studentId:'old-paid',firstBilling:false},'owner');
 assert.equal(s.records.get('opsAccounts/old-paid').openInvoiceId,null);
});
test('invalid first lesson dates never leave a partially registered student or account',async()=>{
 const s=setup(),input={requestId:'bad-first',name:'검증 학생',phone:'01000001234',group:'드럼',planUnits:4,planAmount:180000,remaining:4,firstLessonDate:'2026-02-30'};
 await assert.rejects(s.service.registerStudent(input,'owner'),/날짜/);assert.equal(s.records.size,0);
 s.records.set('students/new-course',{name:'검증 학생',phone:'01000001234'});
 await assert.rejects(s.service.configure({...input,studentId:'new-course',phones:['1234'],firstBilling:true},'owner'),/날짜/);
 assert.equal(s.records.size,1);
});
test('a missed first invoice can be added for an upcoming lesson without changing existing credit',async()=>{
 const s=setup();await s.seed('missed-first',8);const account=s.records.get('opsAccounts/missed-first');
 const input={studentId:account.id,kind:'first',cycleStart:'2999-01-02',expectedUpdatedAt:account.updatedAt};
 await s.service.createCurrentCycleInvoice(input,'owner');
 const invoice=s.records.get('opsInvoices/first_missed-first');assert.equal(invoice.creditUnits,0);assert.equal(invoice.cycleStart,input.cycleStart);
 assert.equal(s.records.get('opsAccounts/missed-first').remaining,8);
 await assert.rejects(s.service.createCurrentCycleInvoice(input,'owner'),/이미/);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
});
test('a missed initial invoice can await its first lesson date without inventing a date or adding credit',async()=>{
 const s=setup();await s.seed('undated-new',12);const account=s.records.get('opsAccounts/undated-new');
 await s.service.createCurrentCycleInvoice({studentId:account.id,kind:'first',cycleStart:'',expectedUpdatedAt:account.updatedAt},'owner');
 const invoice=s.records.get('opsInvoices/first_undated-new');assert.equal(invoice.cycleStart,undefined);assert.equal(invoice.creditUnits,0);
 assert.equal(s.load('billing-display').invoiceCycleStart(invoice,{}),undefined);
 const today=s.load('model').seoulDay();
 assert.equal(s.load('billing-display').invoiceCycleStart(invoice,{[account.id]:[today]}),today);
 assert.equal(s.load('billing-display').invoiceCycleStart({...invoice,id:'renewal'},{[account.id]:[today]}),undefined);
 await s.service.payment({invoiceId:invoice.id,requestId:'undated-paid',amount:160000,method:'현금'},'owner');
 assert.equal(s.records.get('opsAccounts/undated-new').remaining,12);
});
test('registration rejects existing legacy students and invalid input before creating records',async()=>{
 const s=setup();s.records.set('students/legacy',{name:'기존 학생',phone:'010-0000-1234'});
 const input={requestId:'new',name:'기존학생',phone:'01000001234',group:'드럼',planUnits:4,planAmount:180000,remaining:4};
 await assert.rejects(s.service.registerStudent(input,'owner'));
 for(const patch of [{phone:'1234'},{planAmount:0},{remaining:5},{group:'없는 과목'}])await assert.rejects(s.service.registerStudent({...input,...patch},'owner'));
 assert.equal(s.records.size,1);
});
test('quick attendance reasons save without notes, preserve balance on retries and block kiosk false success',async()=>{
 for(const status of ['late_cancel','travel','sick']){
  const s=setup();await s.seed('student-a',8);const day=s.load('model').seoulDay();
  const units=s.load('model').defaultAttendanceUnits(status,'드럼');
  const input={studentId:'student-a',day,status,units,note:'',expectedUpdatedAt:''};
  await s.service.recordAttendance(input,'owner');await s.service.recordAttendance(input,'owner');
  assert.equal(s.records.get('opsAccounts/student-a').remaining,8-units);
  assert.equal(s.records.get(`opsAttendance/student-a_${day}`).status,status);
  await assert.rejects(s.service.checkIn('student-a','1234','device'));
  const revision=s.records.get(`opsAttendance/student-a_${day}`).updatedAt;
  await s.service.recordAttendance({...input,status:'present',units:1,expectedUpdatedAt:revision},'owner');
  assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 }
 const s=setup();assert.equal(s.load('model').defaultAttendanceUnits('late_cancel','어린이 피아노(1관)'),0);
});
test('guardian phone updates all owned courses and lookups without changing siblings, balances or history',async()=>{
 const s=setup(),source='person';
 s.records.set(`students/${source}`,{name:'다과목 학생',phone:'010-0000-1234',instruments:['피아노','드럼']});
 const ids=['피아노','드럼'].map(subject=>s.service.enrollmentId(source,subject));
 for(const [i,subject] of ['피아노','드럼'].entries())await s.service.configure({studentId:ids[i],sourceStudentId:source,subject,planUnits:8,planAmount:160000,remaining:6-i,phone:'01000001234',phones:['1234','5678'],active:true},'owner');
 await s.seed('sibling',4);const other=structuredClone(s.records.get('opsAccounts/sibling'));
 // An account may still have an old, different guardian contact from per-course setup.
 Object.assign(s.records.get(`opsAccounts/${ids[1]}`),{phone:'01000008888',checkinSuffixes:['8888','5678']});
 const before=ids.map(id=>structuredClone(s.records.get(`opsAccounts/${id}`)));
 s.records.set('opsAttendance/history',{studentId:ids[0],status:'travel',units:0});
 s.records.set('opsInvoices/history',{studentId:ids[0],status:'open',paid:0,amount:160000});
 s.records.set('opsNotices/history',{studentId:ids[0],phone:'01000001234',status:'submitted'});
 const history=['opsAttendance/history','opsInvoices/history','opsNotices/history'].map(k=>structuredClone(s.records.get(k)));
 const input={studentId:ids[0],sourceStudentId:source,phone:'010-1111-0012',expectedPhone:'010-0000-1234',expectedUpdatedAt:''};
 const changes=await s.service.updateStudentPhone(input,'owner');
 assert.equal(s.records.get('students/person').phone,'01011110012');assert.equal(s.records.get('students/person').phoneLast4,'0012');
 for(const [i,id] of ids.entries()){
  const a=s.records.get(`opsAccounts/${id}`);assert.equal(a.phone,'01011110012');assert.deepEqual(a.checkinSuffixes,['0012','5678']);
  for(const field of ['id','sourceStudentId','subject','name','remaining','planUnits','planAmount','openInvoiceId','active'])assert.deepEqual(a[field],before[i][field]);
  await assert.rejects(s.service.checkIn(id,i===0?'1234':'8888','device'));
 }
 assert.deepEqual(s.records.get('opsAccounts/sibling'),other);
 assert.deepEqual(['opsAttendance/history','opsInvoices/history','opsNotices/history'].map(k=>s.records.get(k)),history);
 const lookup=async digits=>(await (await s.checkInPost({action:'lookup',digits})).json()).matches.map(m=>m.id);
 assert.deepEqual((await lookup('0012')).sort(),[...ids].sort());assert.deepEqual(await lookup('1234'),['sibling']);
 assert.deepEqual(await s.service.updateStudentPhone(input,'owner'),changes);
 assert.equal([...s.records.values()].filter(v=>v.action==='update-student-phone').length,1);
 const students=ids.map(id=>({id,sourceStudentId:source,phone:'01000001234'})).concat([{id:'sibling',phone:'01000001234'}]);
 const snapshot=s.load('snapshot-changes').applySnapshotChanges({students,accounts:before,attendance:[],invoices:[],day:'2026-10-01'},changes);
 assert.deepEqual(snapshot.students.map(v=>v.phone),['01011110012','01011110012','01000001234']);
 await s.service.checkIn(ids[0],'0012','device');assert.equal(s.records.get(`opsAccounts/${ids[0]}`).remaining,5);
 assert.equal([...s.records.entries()].find(([k,v])=>k.startsWith('opsNotices/attendance_')&&v.studentId===ids[0])[1].phone,'01011110012');
});
test('guardian edits reject stale or unrelated targets and work before enrollment or on legacy accounts',async()=>{
 const s=setup();await s.seed();await s.seed('other');
 const input={studentId:'student-a',sourceStudentId:'student-a',phone:'01022220012',expectedPhone:'01000001234'};
 for(const patch of [{phone:''},{phone:'1234'},{phone:'abc01022220012'},{studentId:'other'},{expectedPhone:'01099999999'}])await assert.rejects(s.service.updateStudentPhone({...input,...patch},'owner'));
 const simultaneous=await Promise.allSettled([s.service.updateStudentPhone(input,'owner'),s.service.updateStudentPhone({...input,phone:'01033339999'},'owner')]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);assert.equal(s.records.get('opsAccounts/other').phone,'01000001234');
 s.records.set('students/unconfigured',{name:'미등록',phone:'',instruments:['피아노']});
 const id=s.service.enrollmentId('unconfigured','피아노');
 await s.service.updateStudentPhone({studentId:id,sourceStudentId:'unconfigured',phone:'010-1234-0000',expectedPhone:''},'owner');
 assert.equal(s.records.get('students/unconfigured').phoneLast4,'0000');assert.equal(s.records.has(`opsAccounts/${id}`),false);
});
test('pending attendance notices use the new guardian phone while sent notices stay unchanged',async()=>{
 const s=setup();await s.seed('student-a',8);await s.service.checkIn('student-a','1234','device');
 const sent={studentId:'student-a',phone:'01000001234',status:'submitted',kind:'attendance'};s.records.set('opsNotices/sent',sent);
 await s.service.updateStudentPhone({studentId:'student-a',sourceStudentId:'student-a',phone:'01011110012',expectedPhone:'01000001234'},'owner');
 const keys=['NHN_APP_KEY','NHN_SECRET_KEY','NHN_SENDER_KEY','NHN_ATTENDANCE_TEMPLATE'],env={...process.env},original=global.fetch,bodies=[];
 for(const k of keys)process.env[k]='test';
 global.fetch=async(_,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({header:{isSuccessful:true},recipientList:[{resultCode:0}]})};};
 try{
  await s.load('notices').processNotices();assert.equal(bodies.length,1);assert.equal(bodies[0].recipientList[0].recipientNo,'01011110012');
  assert.deepEqual(s.records.get('opsNotices/sent'),sent);
  assert.equal([...s.records.entries()].find(([k])=>k.startsWith('opsNotices/attendance_'))[1].phone,'01011110012');
 }finally{global.fetch=original;for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
test('single student save atomically changes name, guardian and one course while keeping lesson and financial records',async()=>{
 const s=setup();s.records.set('students/person',{name:'기존 학생',phone:'01000001234',instruments:['피아노','드럼']});
 const ids=['피아노','드럼'].map(subject=>s.service.enrollmentId('person',subject));
 for(const [i,subject] of ['피아노','드럼'].entries())await s.service.configure({studentId:ids[i],sourceStudentId:'person',subject,planUnits:8,planAmount:160000,remaining:6-i,phone:'01000001234',phones:['1234','5678'],active:true},'owner');
 await s.seed('other',4);const other=structuredClone(s.records.get('opsAccounts/other'));
 const before=ids.map(id=>structuredClone(s.records.get(`opsAccounts/${id}`)));
 s.records.set('opsAttendance/history',{studentId:ids[0],name:'기존 학생 · 피아노',units:1});
 s.records.set('opsInvoices/history',{studentId:ids[0],amount:160000,status:'open'});
 const history=['opsAttendance/history','opsInvoices/history'].map(k=>structuredClone(s.records.get(k)));
 await s.service.saveStudentInfo({sourceStudentId:'person',studentId:ids[0],name:'수정 학생',phone:'010-1111-0012',subject:'피아노',mode:'change',group:'어린이 피아노(2관)',expectedName:'기존 학생',expectedPhone:'01000001234'},'owner');
 const student=s.records.get('students/person');assert.equal(student.name,'수정 학생');assert.equal(student.phone,'01011110012');assert.equal(student.phoneLast4,'0012');assert.equal(student.operationsCourseGroups['피아노'],'어린이 피아노(2관)');
 for(const [i,id] of ids.entries()){
  const a=s.records.get(`opsAccounts/${id}`);assert.equal(a.name,`수정 학생 · ${a.subject}`);assert.equal(a.phone,'01011110012');assert.deepEqual(a.checkinSuffixes,['0012','5678']);
  for(const field of ['id','subject','sourceStudentId','remaining','planUnits','planAmount','openInvoiceId','active'])assert.deepEqual(a[field],before[i][field]);
 }
 assert.equal(s.records.get(`opsAccounts/${ids[0]}`).attendanceGroup,'어린이 피아노(2관)');assert.equal(s.records.get(`opsAccounts/${ids[1]}`).attendanceGroup,undefined);
 assert.deepEqual(s.records.get('opsAccounts/other'),other);assert.deepEqual(['opsAttendance/history','opsInvoices/history'].map(k=>s.records.get(k)),history);
 assert.equal([...s.records.values()].filter(v=>v.action==='save-student-info').length,1);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,0);
 // Adding another course in the same save leaves existing course balances alone.
 await s.service.saveStudentInfo({sourceStudentId:'person',studentId:ids[0],name:'최종 학생',subject:'피아노',mode:'add',group:'보컬',expectedName:'수정 학생',expectedCourseUpdatedAt:student.courseUpdatedAt},'owner');
 assert.deepEqual(s.records.get('students/person').instruments,['피아노','드럼','보컬']);assert.equal(s.records.get('students/person').name,'최종 학생');
 assert.equal(s.records.has(`opsAccounts/${s.service.enrollmentId('person','보컬')}`),false);
 assert.equal(s.records.get(`opsAccounts/${ids[0]}`).remaining,6);
});
test('invalid combined course or stale phone edits cannot partially save names or contacts',async()=>{
 const s=setup();s.records.set('students/person',{name:'기존 학생',phone:'01000001234',instruments:['피아노','드럼']});
 const id=s.service.enrollmentId('person','피아노');
 await s.service.configure({studentId:id,sourceStudentId:'person',subject:'피아노',planUnits:8,planAmount:160000,remaining:6,phone:'01000001234',phones:['1234'],active:true},'owner');
 const initial=structuredClone([...s.records]);
 const input={sourceStudentId:'person',studentId:id,name:'변경 학생',phone:'01011110012',subject:'피아노',mode:'change',group:'어린이 피아노(2관)',expectedName:'기존 학생',expectedPhone:'01000001234'};
 for(const patch of [{group:'드럼'},{expectedPhone:'01099999999'},{expectedCourseUpdatedAt:'stale'},{phone:'1234'},{name:''},{studentId:'unrelated'}]){
  await assert.rejects(s.service.saveStudentInfo({...input,...patch},'owner'));assert.deepEqual([...s.records],initial);
 }
});
test('partial student save preserves fields not edited and does not require missing legacy phone or course setup',async()=>{
 const s=setup();await s.seed('legacy',5);
 Object.assign(s.records.get('students/legacy'),{phone:'',name:'번호 없는 학생'});
 await s.service.saveStudentInfo({studentId:'legacy',sourceStudentId:'legacy',name:'이름만 수정',expectedName:'번호 없는 학생'},'owner');
 assert.equal(s.records.get('students/legacy').phone,'');assert.equal(s.records.get('opsAccounts/legacy').phone,'01000001234');
 const before=structuredClone([...s.records]);await s.service.saveStudentInfo({studentId:'legacy',sourceStudentId:'legacy'},'owner');assert.deepEqual([...s.records],before);
 // A phone-only edit must keep an unrelated name change made after opening the form.
 await s.service.saveStudentInfo({studentId:'legacy',sourceStudentId:'legacy',phone:'01011110012',expectedPhone:'',expectedName:'번호 없는 학생'},'owner');
 assert.equal(s.records.get('students/legacy').name,'이름만 수정');assert.equal(s.records.get('opsAccounts/legacy').remaining,5);
});
function setup() {
  const records = new Map(); let sequence = 0; let tail = Promise.resolve();
  const ref = p => ({ path: p, id: p.split('/').at(-1), get: async () => snap(p), update: async d => { if (!records.has(p)) throw Error('missing'); records.set(p, { ...records.get(p), ...structuredClone(d) }); }, set: async d => records.set(p, structuredClone(d)) });
  const snap = p => ({ exists: records.has(p), id: p.split('/').at(-1), ref: ref(p), data: () => structuredClone(records.get(p)) });
  const query = (name, filters = [], max = Infinity) => ({
    doc: id => ref(`${name}/${id || `generated-${++sequence}`}`),
    where: (field, op, value) => query(name, [...filters, [field, op, value]], max),
    limit: n => query(name, filters, n),
    get: async () => { const docs = [...records.keys()].filter(p => p.startsWith(name + '/') && p.split('/').length === 2).filter(p => filters.every(([f, op, v]) => op === '==' ? records.get(p)[f] === v : op === 'in' ? v.includes(records.get(p)[f]) : records.get(p)[f].includes(v))).slice(0,max).map(snap); return { docs, size: docs.length }; },
  });
  const db = {
    doc: ref, collection: query,
    runTransaction(fn) {
      const result = tail.then(async () => {
        const writes = []; let written = false;
        const tx = {
          get: async r => { assert.equal(written, false, 'Firestore forbids reads after writes'); return r.path ? snap(r.path) : r.get(); },
          create: (r,d) => { written = true; writes.push(['create',r.path,structuredClone(d)]); },
          set: (r,d) => { written = true; writes.push(['set',r.path,structuredClone(d)]); },
          update: (r,d) => { written = true; writes.push(['update',r.path,structuredClone(d)]); },
        };
        const value = await fn(tx);
        for (const [kind,p,d] of writes) { if (kind === 'create') assert.equal(records.has(p),false); if (kind === 'update') assert.equal(records.has(p),true); records.set(p, kind === 'update' ? {...records.get(p),...d} : d); }
        return value;
      }); tail = result.catch(() => {}); return result;
    },
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const modules = {};
  function load(name) {
    if (modules[name]) return modules[name];
    const code = fs.readFileSync(path.join(root, name + '.ts'),'utf8'); const exports = {};
    modules[name] = exports;
    const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require','exports',output)(id => id === './auth' ? { database: () => db, HttpError, hash: v => require('node:crypto').createHash('sha256').update(v).digest('hex') } : id.startsWith('./') ? load(id.slice(2)) : require(id), exports);
    return exports;
  }
  const service = load('service');
  const seed = async (id = 'student-a', remaining = 1) => {
    records.set(`students/${id}`, { name: '가상 학생', phone:'01000001234' });
    await service.configure({studentId:id, planUnits:8, planAmount:160000, remaining, phone:'01000001234', phones:['1234','5678'], active:true}, 'owner');
  };
  const routeExports={};
  const routeCode=fs.readFileSync('src/app/api/operations/import/route.ts','utf8');
  new Function('require','exports',ts.transpileModule(routeCode,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id.endsWith('/auth')?{database:()=>db,manager:async()=> 'owner',sameOrigin:()=>{},failure:e=>Response.json({error:e.message},{status:400}),hash:v=>require('node:crypto').createHash('sha256').update(v).digest('hex')}:id.endsWith('/service')?service:id.endsWith('/refresh-import')?load('refresh-import'):id.endsWith('/import-cache')?{invalidateImportCache:()=>{}}:load('model'),routeExports);
  const checkInRoute={};
  const checkInCode=fs.readFileSync('src/app/api/check-in/route.ts','utf8');
  new Function('require','exports',ts.transpileModule(checkInCode,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id==='next/server'?{after:()=>{}}:id.endsWith('/auth')?{database:()=>db,device:async()=> 'device',sameOrigin:()=>{},failure:e=>Response.json({error:e.message},{status:400})}:load(id.split('/').at(-1)),checkInRoute);
  return { records, service, load, seed, checkInPost:body=>checkInRoute.POST(new Request('https://test/api/check-in',{method:'POST',body:JSON.stringify(body)})), importPost:body=>routeExports.POST(new Request('https://test/api/operations/import',{method:'POST',body:JSON.stringify(body)})) };
}
test('concurrent duplicate check-ins deduct once and create one invoice/outbox', async () => {
  const s = setup(); await s.seed();
  const results = await Promise.all([s.service.checkIn('student-a','1234','device'),s.service.checkIn('student-a','1234','device')]);
  assert.equal(results.filter(r => r.duplicate).length,1);
  assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
  assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
  assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,1);
});
test('unregistered code cannot attend; dual configured numbers accepted', async () => {
  const s=setup(); await s.seed();
  await assert.rejects(s.service.checkIn('student-a','9999','device'));
  assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
  assert.equal((await s.service.checkIn('student-a','5678','device')).duplicate,false);
});
test('adjust to two lessons and reverse to zero preserves accounting and flags invoice', async () => {
  const s=setup(); await s.seed(); await s.service.checkIn('student-a','1234','device');
  const attendanceId=[...s.records.keys()].find(k=>k.startsWith('opsAttendance/')).split('/')[1];
  await s.service.adjust({attendanceId,units:2,note:'연속 수업'},'owner'); assert.equal(s.records.get('opsAccounts/student-a').remaining,-1);
  await s.service.adjust({attendanceId,units:0,note:'출석 취소'},'owner'); assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
  const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId; assert.equal(s.records.get(`opsInvoices/${invoiceId}`).needsReview,true);
  await assert.rejects(s.service.payment({invoiceId,requestId:'p1',amount:160000,method:'현금'},'owner'));
});
test('partial then concurrent duplicate final payment credits units only once', async () => {
  const s=setup(); await s.seed(); await s.service.checkIn('student-a','1234','device');
  const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
  await s.service.payment({invoiceId,requestId:'part',amount:60000,method:'현금'},'owner'); assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
  const request={invoiceId,requestId:'finish',amount:100000,method:'지역화폐'};
  await Promise.all([s.service.payment(request,'owner'),s.service.payment(request,'owner')]);
  assert.equal(s.records.get('opsAccounts/student-a').remaining,8); assert.equal(s.records.get('opsAccounts/student-a').openInvoiceId,null);
  assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsPayments/')).length,2);
});
test('overpayment and duplicate id with changed amount fail without writes', async () => {
  const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
  await assert.rejects(s.service.payment({invoiceId,requestId:'bad',amount:170000,method:'카드'},'owner'));
  assert.equal(s.records.has('opsPayments/bad'),false);
  await s.service.payment({invoiceId,requestId:'same',amount:10000,method:'카드'},'owner');
  await assert.rejects(s.service.payment({invoiceId,requestId:'same',amount:20000,method:'카드'},'owner'));
});
test('changing plan synchronizes the linked unpaid invoice without resetting balance', async () => {
  const s=setup();await s.seed();await s.service.createInvoice('student-a','owner'); const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
  const changes = await s.service.configure({studentId:'student-a',planUnits:12,planAmount:210000,remaining:99,phone:'01000005678',phones:['5678']},'owner');
  assert.equal(changes, undefined); // plan length needs historical sequence recalculation
  const feeOnly = await s.service.configure({studentId:'student-a',planUnits:12,planAmount:230000,phone:'01000005678',phones:['5678']},'owner');
  assert.deepEqual(feeOnly.accounts, [s.records.get('opsAccounts/student-a')]);
  assert.deepEqual(Object.keys(feeOnly), ['accounts', 'invoices']);
  assert.deepEqual(feeOnly.invoices, [s.records.get(`opsInvoices/${invoiceId}`)]);
  assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
  const invoice=s.records.get(`opsInvoices/${invoiceId}`);assert.equal(invoice.amount,230000);assert.equal(invoice.units,12);assert.equal(invoice.creditUnits,12);
});
test('prepayment adds units without losing remaining lessons', async () => {
  const s=setup();await s.seed('student-a',3);await s.service.createInvoice('student-a','owner');const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
  await s.service.payment({invoiceId,requestId:'prepay',amount:160000,method:'계좌이체'},'owner');
  assert.equal(s.records.get('opsAccounts/student-a').remaining,11);
});
test('pairing is one-use and expired code is rejected', async () => {
  const s=setup(); const {code}=await s.service.issuePair('owner');const token=await s.service.pair(code);assert.equal(token.length,64);await assert.rejects(s.service.pair(code));
  const second=await s.service.issuePair('owner'); const pairKey=[...s.records.keys()].find(k=>k.startsWith('opsPairing/')&&!s.records.get(k).used);s.records.get(pairKey).expiresAt=0;await assert.rejects(s.service.pair(second.code));
});
test('invoice cancellation clears pending claim; partial payments block cancellation',async()=>{
 const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
 await s.service.invoiceAction({invoiceId,action:'cancelInvoice'},'owner');assert.equal(s.records.get('opsAccounts/student-a').openInvoiceId,null);
 await s.service.createInvoice('student-a','owner');const next=s.records.get('opsAccounts/student-a').openInvoiceId;await s.service.payment({invoiceId:next,requestId:'partial',amount:1000,method:'현금'},'owner');await assert.rejects(s.service.invoiceAction({invoiceId:next,action:'cancelInvoice'},'owner'));
});
test('NHN timeout becomes unknown and is never automatically resent',async()=>{
 const s=setup();await s.seed();await s.service.checkIn('student-a','1234','device');
 const saved={...process.env};for(const k of ['NHN_APP_KEY','NHN_SECRET_KEY','NHN_SENDER_KEY','NHN_ATTENDANCE_TEMPLATE'])process.env[k]='test';
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error('timeout');};
 try{const worker=s.load('notices');await worker.processNotices();await worker.processNotices();assert.equal(calls,1);assert.equal([...s.records.values()].filter(x=>x.status==='unknown').length,1);}finally{global.fetch=original;for(const k of ['NHN_APP_KEY','NHN_SECRET_KEY','NHN_SENDER_KEY','NHN_ATTENDANCE_TEMPLATE']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
test('missing NHN config preserves blocked notice without sending',async()=>{
 const s=setup();await s.seed();await s.service.checkIn('student-a','1234','device');const previous=process.env.NHN_APP_KEY;delete process.env.NHN_APP_KEY;
 const original=global.fetch;global.fetch=()=>{throw Error('must not send');};
 try{await s.load('notices').processNotices();assert.equal([...s.records.values()].filter(x=>x.status==='blocked').length,1);}finally{global.fetch=original;if(previous!==undefined)process.env.NHN_APP_KEY=previous;}
});

test('billing stays blocked even with NHN billing credentials configured', async () => {
 const s=setup(); await s.seed(); await s.service.createInvoice('student-a','owner');
 const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
 await s.service.invoiceAction({invoiceId,action:'sendInvoice'},'owner');
 const keys=['NHN_APP_KEY','NHN_SECRET_KEY','NHN_SENDER_KEY','NHN_BILLING_TEMPLATE'];
 const saved={...process.env}; for(const key of keys) process.env[key]='test';
 const original=global.fetch; let calls=0; global.fetch=async()=>{calls++;throw Error('must not send');};
 try {
  await s.load('notices').processNotices(); assert.equal(calls,0);
  assert.equal(s.records.get(`opsNotices/billing_${invoiceId}`).status,'blocked');
  assert.match(s.records.get(`opsNotices/billing_${invoiceId}`).error,/결제선생/);
 } finally { global.fetch=original; for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];} }
});
test('manual absence, makeup and repeated saves preserve lesson balances', async()=>{
 const s=setup();await s.seed();const day=s.load('model').seoulDay();
 const input={studentId:'student-a',day,status:'absent',units:0,note:'결석',expectedUpdatedAt:''};
 await s.service.recordAttendance(input,'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,0);
 const ref=`opsAttendance/student-a_${day}`;
 const makeup={...input,status:'makeup',units:1,note:'보강',expectedUpdatedAt:s.records.get(ref).updatedAt};
 await s.service.recordAttendance(makeup,'owner');await s.service.recordAttendance(makeup,'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 await assert.rejects(s.service.recordAttendance({...makeup,units:2,expectedUpdatedAt:'stale'},'owner'));
 await s.service.recordAttendance({...makeup,units:0,note:'이미 차감한 수업',expectedUpdatedAt:s.records.get(ref).updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 assert.equal([...s.records.values()].filter(x=>x.needsReview).length,1);
});
test('invalid dates, future charged attendance and nonzero cancellation are rejected', async()=>{
 const s=setup();await s.seed();const input={studentId:'student-a',day:'2026-02-30',status:'absent',units:0,note:'test'};
 for(const patch of [{},{day:'2999-01-01',status:'present',units:1},{day:'2999-01-01',status:'absent',units:1},{day:s.load('model').seoulDay(),status:'cancelled',units:1},{day:s.load('model').seoulDay(),status:'invalid'}]) await assert.rejects(s.service.recordAttendance({...input,...patch},'owner'));
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
});
test('kiosk does not report absence as successful attendance',async()=>{
 const s=setup();await s.seed();await s.service.recordAttendance({studentId:'student-a',day:s.load('model').seoulDay(),status:'absent',units:0,note:'결석'},'owner');
 await assert.rejects(s.service.checkIn('student-a','1234','device'),{status:409});
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
});
test('two courses for one student deduct and settle independently',async()=>{
 const s=setup();s.records.set('students/person',{name:'테스트',phone:'01000001234',instruments:['피아노','보컬']});
 const piano=s.service.enrollmentId('person','피아노');const vocal=s.service.enrollmentId('person','보컬');
 for(const [id,subject,remaining] of [[piano,'피아노',1],[vocal,'보컬',3]]) await s.service.configure({studentId:id,sourceStudentId:'person',subject,planUnits:4,planAmount:160000,remaining,phone:'01000001234',phones:['1234']},'owner');
 await s.service.checkIn(piano,'1234','device');await s.service.checkIn(vocal,'1234','device');
 assert.equal(s.records.get(`opsAccounts/${piano}`).remaining,0);assert.equal(s.records.get(`opsAccounts/${vocal}`).remaining,2);
 const invoiceId=s.records.get(`opsAccounts/${piano}`).openInvoiceId;
 await s.service.payment({invoiceId,requestId:'course-payment',amount:160000,method:'현금'},'owner');
 assert.equal(s.records.get(`opsAccounts/${piano}`).remaining,4);assert.equal(s.records.get(`opsAccounts/${vocal}`).remaining,2);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsAttendance/')).length,2);
 await assert.rejects(s.service.configure({studentId:piano,sourceStudentId:'person',subject:'보컬',planUnits:4,planAmount:160000,phone:'01000001234',phones:['1234']},'owner'));
});

test('opening balance import is idempotent and does not send notices or duplicate billing', async()=>{
 const s=setup();const id='a'.repeat(64);
 s.records.set('students/person',{name:'가상',phone:'01000001234',instruments:['보컬']});
 s.records.set(`opsImports/${id}`,{matchedStudentId:'person',subject:'보컬',phone:'01000001234',remainingCandidate:3,planUnits:8,planAmount:170000,issues:['잔여 후보 확인 필요'],asOf:s.load('model').seoulDay(),status:'review'});
 assert.equal((await s.importPost({action:'activate',id})).status,200);
 assert.equal((await s.importPost({action:'activate',id})).status,200);
 const account=s.records.get(`opsAccounts/${s.service.enrollmentId('person','보컬')}`);
 assert.equal(account.remaining,3);assert.equal(account.autoBilling,false);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsAccounts/')).length,1);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')||k.startsWith('opsNotices/')).length,0);
});
test('opening import blocks unresolved, stale, and existing accounts',async()=>{
 for(const change of [{issues:['전화번호 확인 필요']},{asOf:'2020-01-01'},{subject:'드럼'},{remainingCandidate:null},{existing:true}]){
 const s=setup();const id='b'.repeat(64);s.records.set('students/person',{name:'가상',instruments:['보컬']});
 s.records.set(`opsImports/${id}`,{matchedStudentId:'person',subject:'보컬',phone:'01000001234',remainingCandidate:3,planUnits:8,planAmount:170000,issues:['잔여 후보 확인 필요'],asOf:s.load('model').seoulDay(),status:'review',...change});
 if(change.existing)s.records.set(`opsAccounts/${s.service.enrollmentId('person','보컬')}`,{remaining:9});
 assert.equal((await s.importPost({action:'activate',id})).status,400);
 if(change.existing)assert.equal(s.records.get(`opsAccounts/${s.service.enrollmentId('person','보컬')}`).remaining,9);
 }
});

test('attendance already included in imported opening balance is not deducted again',async()=>{
 const s=setup();await s.seed();const day=s.load('model').seoulDay();
 const a=s.records.get('opsAccounts/student-a');s.records.set('opsAccounts/student-a',{...a,importId:'legacy',openingAsOf:day});
 s.records.set('opsImports/legacy',{history:[{cells:[{day,value:'7'}]}]});
 assert.equal((await s.service.checkIn('student-a','1234','device')).duplicate,true);
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
});

test('archive refresh preserves live attendance and balances, backs up source and is idempotent',async()=>{
 const s=setup();await s.seed();const day=s.load('model').seoulDay();const month=day.slice(0,7);const id='a'.repeat(64);
 const history={name:'가상 학생',subject:'보컬',sheet:'이번 달',row:3,section:'보컬',note:'',cells:[{day,value:'4',color:'FF000000'}]};
 const oldHistory={...history,cells:[{day,value:'3',color:'FF000000'}]};
 s.records.set(`opsImports/${id}`,{name:'가상 학생',subject:'보컬',asOf:day,remainingCandidate:5,status:'activated',history:[oldHistory]});
 s.records.set('opsAttendance/live',{day,units:1});
 const before=structuredClone([...s.records].filter(([k])=>!k.startsWith('opsImports/')));
 const payload={action:'refresh-attendance',month,asOf:day,rows:[{id,revision:0,history:[history]}]};
 assert.equal((await s.importPost(payload)).status,200);
 const imported=s.records.get(`opsImports/${id}`);
 assert.equal(imported.attendanceRevision,1);assert.equal(imported.remainingCandidate,5);assert.equal(imported.asOf,day);
 assert.deepEqual(s.records.get(`opsImports/${id}/revisions/1`).history,[oldHistory]);
 for(const [k,v] of before)assert.deepEqual(s.records.get(k),v);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsInvoices/')||k.startsWith('opsNotices/')),false);
 assert.equal((await (await s.importPost(payload)).json()).results[0].duplicate,true);
 const changed=structuredClone(payload);changed.rows[0].history[0].cells[0].value='5';
 assert.equal((await s.importPost(changed)).status,400);
 changed.rows[0].revision=1;changed.rows[0].history[0].subject='드럼';
 assert.equal((await s.importPost(changed)).status,400);
 assert.equal(s.records.get(`opsImports/${id}`).attendanceRevision,1);
});

test('archive refresh rejects future cells, duplicate days and ambiguous source rows',async()=>{
 const s=setup();const day=s.load('model').seoulDay(),month=day.slice(0,7),id='b'.repeat(64);
 const h={name:'학생',subject:'보컬',sheet:'이번 달',row:2,section:'보컬',note:'',cells:[{day,value:'1',color:''}]};
 s.records.set(`opsImports/${id}`,{name:'학생',subject:'보컬',asOf:day,history:[h,h]});
 const p={action:'refresh-attendance',month,asOf:day,rows:[{id,revision:0,history:[h]}]};
 assert.equal((await s.importPost(p)).status,400);
 s.records.get(`opsImports/${id}`).history=[];
 const duplicate=structuredClone(p);duplicate.rows[0].history[0].cells.push(h.cells[0]);assert.equal((await s.importPost(duplicate)).status,400);
 const future=structuredClone(p);future.asOf='2099-09-23';future.month='2099-09';assert.equal((await s.importPost(future)).status,400);
 assert.equal(s.records.get(`opsImports/${id}`).attendanceRevision,undefined);
});

test('save response contains committed attendance, balance and invoice including retries',async()=>{
 const s=setup();await s.seed();const day=s.load('model').seoulDay();
 const input={studentId:'student-a',day,status:'present',units:1,note:''};
 const changes=await s.service.recordAttendance(input,'owner');
 assert.deepEqual(changes.attendance[0],s.records.get(`opsAttendance/student-a_${day}`));
 assert.deepEqual(changes.accounts[0],s.records.get('opsAccounts/student-a'));
 const invoice=s.records.get(`opsInvoices/${changes.invoices[0].id}`);
 for(const [key,value] of Object.entries(changes.invoices[0]))assert.deepEqual(value,invoice[key]);
 const retry=await s.service.recordAttendance(input,'owner');
 assert.deepEqual(retry.accounts,changes.accounts);
 const correction=await s.service.recordAttendance({...input,status:'absent',units:0,expectedUpdatedAt:changes.attendance[0].updatedAt},'owner');
 assert.equal(correction.accounts[0].remaining,1);assert.equal(correction.invoices[0].needsReview,true);
});
test('confirmed patches preserve other data, update only the selected course, and respect selected month',async()=>{
 const s=setup();await s.seed();const day=s.load('model').seoulDay();
 const changes=await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'paused',until:day},'owner');
 assert.deepEqual(changes.lifecycle.value,s.records.get('students/student-a').courseLifecycles['student-a']);
 const current={day,students:[{id:'student-a',sourceStudentId:'student-a'},{id:'course2',sourceStudentId:'student-a'},{id:'other'}],attendance:[],accounts:[{id:'other',remaining:8}],invoices:[{id:'paid',status:'open'}],payments:[],notices:[],legacyAttendance:[]};
 const next=s.load('snapshot-changes').applySnapshotChanges(current,{...changes,attendance:[{id:'past',day:'2020-01-01'}],accounts:[{id:'new',remaining:2}],invoices:[{id:'paid',status:'paid'}]});
 assert.equal(next.students[0].lifecycle.status,'paused');assert.equal(next.students[1].lifecycle,undefined);assert.equal(next.students[2].lifecycle,undefined);
 assert.equal(next.attendance.length,0);assert.equal(next.accounts.length,2);assert.equal(next.invoices.length,0);
 assert.equal(next.legacyAttendance,current.legacyAttendance);assert.equal(next.payments,current.payments);
});

test('remaining correction is audited, course-scoped, retry-safe and never sends notices',async()=>{
 const s=setup();await s.seed();await s.seed('student-b',6);
 const old=s.records.get('opsAccounts/student-a');old.autoBilling=true;
 const input={studentId:'student-a',requestId:'balance-test',remaining:0,note:'',expectedUpdatedAt:old.updatedAt,expectedRemaining:old.remaining};
 const changes=await s.service.correctRemaining(input,'owner');
 assert.equal(changes.accounts[0].remaining,0);assert.equal(changes.invoices.length,1);
 assert.equal(s.records.get('opsAccounts/student-b').remaining,6);
 assert.deepEqual(s.records.get('opsAudit/balance_balance-test').detail,{before:1,after:0,note:''});
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')||k.startsWith('opsAttendance/')||k.startsWith('opsPayments/')),false);
 await s.service.correctRemaining(input,'owner');
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 await assert.rejects(s.service.correctRemaining({...input,remaining:8},'owner'));
 await assert.rejects(s.service.correctRemaining({...input,requestId:'stale',remaining:8},'owner'));
 const current=s.records.get('opsAccounts/student-a');
 const next=await s.service.correctRemaining({...input,requestId:'restore',remaining:5,expectedUpdatedAt:current.updatedAt,expectedRemaining:0},'owner');
 assert.equal(next.accounts[0].remaining,5);assert.equal(next.invoices[0].needsReview,true);
 // Retrying the earlier request must not undo a subsequent correction.
 const retry=await s.service.correctRemaining(input,'owner');assert.equal(retry.accounts[0].remaining,5);
});
test('remaining correction rejects invalid counts and stale balances after check-in',async()=>{
 const s=setup();await s.seed();const a=s.records.get('opsAccounts/student-a');
 const input={studentId:'student-a',requestId:'invalid',remaining:4,expectedUpdatedAt:a.updatedAt,expectedRemaining:a.remaining};
 for(const remaining of [1.5,1001,-1001,'',NaN])await assert.rejects(s.service.correctRemaining({...input,remaining},'owner'));
 await s.service.checkIn('student-a','1234','device');
 await assert.rejects(s.service.correctRemaining(input,'owner'));
 assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
 assert.equal(s.records.has('opsAudit/balance_invalid'),false);
});

test('withdrawal date is recorded and date-only changes are not ignored',async()=>{
 const s=setup();await s.seed();
 const first=await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'withdrawn',withdrawnOn:'2026-01-01'},'owner');
 assert.equal(first.lifecycle.value.withdrawnOn,'2026-01-01');
 const next=await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'withdrawn',withdrawnOn:'2026-01-02',expectedUpdatedAt:first.lifecycle.value.updatedAt},'owner');
 assert.equal(next.lifecycle.value.withdrawnOn,'2026-01-02');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 for(const withdrawnOn of ['bad','2026-02-30','2999-01-01'])await assert.rejects(s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'withdrawn',withdrawnOn},'owner'));
});
test('pause end date edits preserve balances and use the new expiry',async()=>{
 const s=setup();await s.seed();const today=s.load('model').seoulDay();
 const first=await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'paused',until:'2099-01-01',note:'기존 비고'},'owner');
 const result=await s.service.changeLifecycle({studentId:'student-a',sourceStudentId:'student-a',status:'paused',until:today,note:'기존 비고',expectedUpdatedAt:first.lifecycle.value.updatedAt},'owner');
 assert.equal(result.lifecycle.value.until,today);assert.equal(result.lifecycle.value.note,'기존 비고');
 assert.equal(s.load('lifecycle').enrollmentState(result.lifecycle.value,today),'paused');
 assert.equal(s.load('lifecycle').enrollmentState(result.lifecycle.value,'2099-01-02'),'active');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
});

test('current-cycle debt preserves credited lessons through partial and final payment',async()=>{
 const s=setup();await s.seed('student-a',6);s.records.get('opsAccounts/student-a').autoBilling=true;
 const input={studentId:'student-a',cycleStart:s.load('model').seoulDay(),expectedUpdatedAt:s.records.get('opsAccounts/student-a').updatedAt};
 const changes=await s.service.createCurrentCycleInvoice(input,'owner');const inv=changes.invoices[0];
 assert.equal(inv.creditUnits,0);assert.equal(inv.units,8);assert.equal(inv.cycleStart,input.cycleStart);assert.equal(changes.accounts[0].remaining,6);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
 await assert.rejects(s.service.createCurrentCycleInvoice(input,'owner'));
 await s.service.payment({invoiceId:inv.id,requestId:'part',amount:60000,method:'현금'},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,6);
 const final={invoiceId:inv.id,requestId:'final',amount:100000,method:'현금'};
 await s.service.payment(final,'owner');await s.service.payment(final,'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,6);assert.equal(s.records.get('opsAccounts/student-a').openInvoiceId,null);
 await assert.rejects(s.service.createCurrentCycleInvoice(input,'owner'));
});
test('current-cycle invoice rejects invalid date, stale settings and existing debt',async()=>{
 const s=setup();await s.seed();const a=s.records.get('opsAccounts/student-a');
 for(const patch of [{cycleStart:'2999-01-01'},{cycleStart:'bad'},{expectedUpdatedAt:'stale'}])await assert.rejects(s.service.createCurrentCycleInvoice({studentId:'student-a',cycleStart:s.load('model').seoulDay(),expectedUpdatedAt:a.updatedAt,...patch},'owner'));
 await s.service.createInvoice('student-a','owner');
 await assert.rejects(s.service.createCurrentCycleInvoice({studentId:'student-a',cycleStart:s.load('model').seoulDay(),expectedUpdatedAt:a.updatedAt},'owner'));
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
});

test('course group change preserves enrollment and history; adding a course keeps existing courses',async()=>{
 const s=setup();s.records.set('students/person',{name:'가상',instruments:['피아노','드럼']});
 const id=s.service.enrollmentId('person','피아노');
 await s.service.configure({studentId:id,sourceStudentId:'person',subject:'피아노',planUnits:8,planAmount:160000,remaining:6,phone:'01000001234',phones:['1234']},'owner');
 s.records.set('opsAttendance/history',{studentId:id,units:1});
 const input={sourceStudentId:'person',studentId:id,subject:'피아노',mode:'change',group:'어린이 피아노(1관)',expectedUpdatedAt:''};
 await s.service.manageCourse(input,'owner');
 assert.equal(s.records.get(`opsAccounts/${id}`).remaining,6);assert.equal(s.records.get(`opsAccounts/${id}`).attendanceGroup,'어린이 피아노(1관)');
 assert.deepEqual(s.records.get('opsAttendance/history'),{studentId:id,units:1});
 await assert.rejects(s.service.manageCourse({...input,group:'드럼',expectedUpdatedAt:s.records.get('students/person').courseUpdatedAt},'owner'));
 await s.service.manageCourse({...input,mode:'add',group:'보컬',expectedUpdatedAt:s.records.get('students/person').courseUpdatedAt},'owner');
 assert.deepEqual(s.records.get('students/person').instruments,['피아노','드럼','보컬']);
 assert.equal(s.records.has(`opsAccounts/${s.service.enrollmentId('person','보컬')}`),false);
 await assert.rejects(s.service.manageCourse({...input,group:'어린이 피아노(2관)'},'owner'));
});
test('unconfigured course can move to a campus and keeps its group when configured',async()=>{
 const s=setup();s.records.set('students/person',{name:'가상',instruments:['피아노','드럼']});const id=s.service.enrollmentId('person','피아노');
 await s.service.manageCourse({sourceStudentId:'person',studentId:id,subject:'피아노',mode:'change',group:'어린이 피아노(1관)'},'owner');
 await s.service.configure({studentId:id,sourceStudentId:'person',subject:'피아노',planUnits:8,planAmount:160000,remaining:6,phone:'01000001234',phones:['1234']},'owner');
 assert.equal(s.records.get(`opsAccounts/${id}`).attendanceGroup,'어린이 피아노(1관)');
 assert.deepEqual(s.records.get('students/person').instruments,['피아노','드럼']);
});

test('withdrawing drums leaves piano active; course pause dates and reinstatement are independent',async()=>{
 const s=setup();s.records.set('students/person',{name:'가상',instruments:['피아노','드럼']});
 const piano=s.service.enrollmentId('person','피아노'),drums=s.service.enrollmentId('person','드럼');
 for(const [id,subject] of [[piano,'피아노'],[drums,'드럼']])await s.service.configure({studentId:id,sourceStudentId:'person',subject,planUnits:8,planAmount:160000,remaining:6,phone:'01000001234',phones:['1234']},'owner');
 const withdrawn=await s.service.changeLifecycle({sourceStudentId:'person',studentId:drums,status:'withdrawn'},'owner');
 await s.service.checkIn(piano,'1234','device');await assert.rejects(s.service.checkIn(drums,'1234','device'));
 assert.equal(s.records.get(`opsAccounts/${piano}`).remaining,5);assert.equal(s.records.get(`opsAccounts/${drums}`).remaining,6);
 const paused=await s.service.changeLifecycle({sourceStudentId:'person',studentId:piano,status:'paused',until:s.load('model').seoulDay()},'owner');
 await s.service.changeLifecycle({sourceStudentId:'person',studentId:drums,status:'active',expectedUpdatedAt:withdrawn.lifecycle.value.updatedAt},'owner');
 assert.equal(s.records.get('students/person').courseLifecycles[piano].status,'paused');
 await s.service.checkIn(drums,'1234','device');
 await assert.rejects(s.service.checkIn(piano,'1234','device'));
 await assert.rejects(s.service.changeLifecycle({sourceStudentId:'person',status:'withdrawn'},'owner'));
 await assert.rejects(s.service.changeLifecycle({sourceStudentId:'person',studentId:'stranger',status:'withdrawn'},'owner'));
});
test('legacy whole-student withdrawal is preserved until each course is explicitly restored',async()=>{
 const s=setup();const life={status:'withdrawn',until:'',note:'기존 기록',updatedAt:'2026-09-01T00:00:00Z'};
 s.records.set('students/person',{name:'가상',instruments:['피아노','드럼'],lifecycle:life});
 const piano=s.service.enrollmentId('person','피아노'),drums=s.service.enrollmentId('person','드럼');
 await s.service.changeLifecycle({sourceStudentId:'person',studentId:piano,status:'active',expectedUpdatedAt:life.updatedAt},'owner');
 const owner=s.records.get('students/person'),get=s.load('lifecycle').courseLifecycle;
 assert.equal(get(owner,piano).status,'active');assert.equal(get(owner,drums).status,'withdrawn');assert.deepEqual(owner.lifecycle,life);
});

test('common announcements deduplicate phones and respect per-course lifecycle and missing contacts',async()=>{
 const s=setup();const a=s.load('announcements');
 const students=[{id:'p',name:'학생 · 피아노',phone:'010-0000-1234'},{id:'d',name:'학생 · 드럼',phone:'01000001234',lifecycle:{status:'withdrawn'}},{id:'v',name:'형제 · 보컬',phone:'01000001234'},{id:'bad',name:'연락처 없음',phone:'1234'}];
 const result=a.announcementRecipients(students,[],['p','d','v','bad']);
 assert.equal(result.recipients.length,1);assert.deepEqual(result.recipients[0].ids,['p','v']);assert.equal(result.excluded.length,2);
 assert.throws(()=>a.announcementRecipients(students,[],['forged']));
});
async function announcementSetup(){
 const s=setup();await s.seed('student-a',8);await s.seed('student-b',8);
 const a=s.load('announcements');const service=s.load('announcement-service');
 const input={requestId:'notice-test',title:'가상 휴강 공지',templateCode:a.ANNOUNCEMENT_TEMPLATES[0].code,parameters:{대상:'가상 재원생',기간:'10월 9일',사유:'공휴일',재개일:'10월 10일'},studentIds:['student-a','student-b']};
 return {...s,a,noticeService:service,input};
}
function fakeAnnouncementNhn(t,s,send){
 const original=globalThis.fetch;const env={};for(const k of ['NHN_APP_KEY','NHN_SECRET_KEY','NHN_SENDER_KEY']){env[k]=process.env[k];process.env[k]='test-only';}
 t.after(()=>{globalThis.fetch=original;for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 globalThis.fetch=async(url,init)=>url.includes('/templates/')?Response.json({header:{isSuccessful:true},templates:{templateCode:s.input.templateCode,templateContent:s.a.ANNOUNCEMENT_TEMPLATES[0].content,status:'TSC03',templateMessageType:'BA',templateEmphasizeType:'NONE',buttons:[]}}):send(url,init);
}
test('announcement drafts send nothing; owner confirmation sends once with immutable content and no SMS fallback',async t=>{
 const s=await announcementSetup();let sends=0;
 fakeAnnouncementNhn(t,s,async(url,init)=>{sends++;const body=JSON.parse(init.body);assert.equal(body.recipientList.length,1);assert.equal(body.recipientList[0].resendParameter.isResend,false);assert.equal(body.recipientList[0].templateParameter.사유,'공휴일');assert.ok(init.headers['X-NC-API-IDEMPOTENCY-KEY']);return Response.json({header:{isSuccessful:true},message:{requestId:'nhn-test',sendResults:[{recipientNo:'01000001234',resultCode:0}]}});});
 const draft=await s.noticeService.saveAnnouncement(s.input,'owner');assert.equal(sends,0);
 assert.equal((await s.noticeService.saveAnnouncement(s.input,'owner')).id,draft.id);
 await assert.rejects(s.noticeService.saveAnnouncement({...s.input,title:'changed'},'owner'));
 await assert.rejects(s.noticeService.sendAnnouncement({id:draft.id},'owner'));
 await Promise.all([s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner'),s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner')]);
 assert.equal(sends,1);assert.equal((await s.noticeService.getAnnouncement(draft.id)).status,'submitted');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,8);
 await s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner');assert.equal(sends,1);
});
test('unapproved templates, altered contacts, stale drafts and arbitrary template codes cannot send',async t=>{
 const s=await announcementSetup();let sends=0;fakeAnnouncementNhn(t,s,async()=>{sends++;throw Error('must not send');});
 const draft=await s.noticeService.saveAnnouncement(s.input,'owner');
 const old=s.records.get('opsAccounts/student-a');s.records.set('opsAccounts/student-a',{...old,phone:'01000005678'});
 await assert.rejects(s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner'),/연락처/);
 s.records.set('opsAccounts/student-a',old);
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({header:{isSuccessful:true},templates:{status:'TSC02'}});
 await assert.rejects(s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner'),/승인/);
 globalThis.fetch=originalFetch;s.records.get(`opsAnnouncements/${draft.id}`).createdAt='2020-01-01T00:00:00Z';
 await assert.rejects(s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner'),/하루/);
 await assert.rejects(s.noticeService.saveAnnouncement({...s.input,templateCode:'FEEDBACK_LOG_V2'},'owner'));
 assert.equal(sends,0);
});
test('ambiguous announcement responses remain unknown and never auto retry',async t=>{
 const s=await announcementSetup();let sends=0;fakeAnnouncementNhn(t,s,async()=>{sends++;return Response.json({header:{isSuccessful:true}});});
 const draft=await s.noticeService.saveAnnouncement(s.input,'owner');
 assert.equal((await s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner')).status,'unknown');
 await s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner');assert.equal(sends,1);
});
test('announcement delivery lookup distinguishes provider acceptance from delivered and failed recipients',async t=>{
 const s=await announcementSetup();let sends=0;
 s.records.get('opsAccounts/student-b').phone='01000005678';
 fakeAnnouncementNhn(t,s,async(url,init)=>{
  if(init.method==='POST'){sends++;return Response.json({header:{isSuccessful:true},message:{requestId:'nhn-test',sendResults:[{recipientNo:'01000001234',resultCode:0},{recipientNo:'01000005678',resultCode:0}]}});}
  return Response.json({header:{isSuccessful:true},messageSearchResultResponse:{messages:[{recipientNo:'01000001234',messageStatus:'COMPLETED',resultCode:'MRC01'},{recipientNo:'01000005678',messageStatus:'FAILED',resultCode:'MRC02'}]}});
 });
 const draft=await s.noticeService.saveAnnouncement(s.input,'owner');await s.noticeService.sendAnnouncement({id:draft.id,confirmed:true},'owner');
 const result=await s.noticeService.refreshAnnouncement(draft.id);assert.equal(result.status,'partial');assert.deepEqual(result.recipients.map(r=>r.status),['delivered','failed']);assert.equal(sends,1);
});

test('effective-dated weekday changes preserve history, scheduled changes and one-off moves',()=>{
 const {changeSchedule,plannedLesson,ruleOn,moveLesson}=setup().load('schedule');
 const today='2026-09-30';
 let s=changeSchedule(undefined,{start:'2026-10-01',weekdays:[2,4]},'a',today);
 assert.deepEqual(ruleOn(s,'2026-10-06').weekdays,[2,4]);
 assert.ok(plannedLesson(s,'2026-10-01'));assert.equal(plannedLesson(s,'2026-10-02'),null);
 s=moveLesson(s,{from:'2026-10-01',to:'2026-10-02',expectedUpdatedAt:'a'},[],'b',today);
 assert.equal(plannedLesson(s,'2026-10-01'),null);assert.equal(plannedLesson(s,'2026-10-02').origin,'2026-10-01');
 s=changeSchedule(s,{start:'2026-10-12',weekdays:[1,3,5],expectedUpdatedAt:'b'},'c',today);
 s=changeSchedule(s,{start:'2026-11-01',weekdays:[2,4],expectedUpdatedAt:'c'},'d',today);
 assert.deepEqual(ruleOn(s,'2026-10-08').weekdays,[2,4]);assert.deepEqual(ruleOn(s,'2026-10-15').weekdays,[1,3,5]);assert.deepEqual(ruleOn(s,'2026-11-03').weekdays,[2,4]);
 assert.equal(plannedLesson(s,'2026-10-02').origin,'2026-10-01');
 s=changeSchedule(s,{start:'2026-10-12',remove:true,expectedUpdatedAt:'d'},'e',today);
 assert.deepEqual(ruleOn(s,'2026-10-15').weekdays,[2,4]);assert.deepEqual(ruleOn(s,'2026-11-03').weekdays,[2,4]);
 s=moveLesson(s,{from:'2026-10-02',to:'2026-10-01',expectedUpdatedAt:'e'},[],'f',today);
 assert.equal(s.moves.length,0);assert.equal(plannedLesson(s,'2026-10-01').moved,false);
 assert.throws(()=>changeSchedule(s,{start:'2026-09-01',weekdays:[1],expectedUpdatedAt:'f'},'x',today),/지난 일정/);
 assert.throws(()=>changeSchedule(s,{start:'2026-10-01',weekdays:[7],expectedUpdatedAt:'f'},'x',today),/요일/);
 assert.throws(()=>changeSchedule(s,{start:'2026-10-01',weekdays:[1],expectedUpdatedAt:'old'},'x',today),/변경/);
});
test('moving planned lessons rejects occupied, attended, unavailable or stale dates without changing the schedule',()=>{
 const {changeSchedule,moveLesson}=setup().load('schedule'),today='2026-09-30';
 const old=changeSchedule(undefined,{start:'2026-10-01',weekdays:[2,4]},'a',today);
 const input={from:'2026-10-01',to:'2026-10-02',expectedUpdatedAt:'a'};
 for(const patch of [{to:'2026-10-06'},{from:'2026-10-03'},{to:'2026-09-29'},{to:'2026-10-01'},{expectedUpdatedAt:'stale'}])assert.throws(()=>moveLesson(old,{...input,...patch},[],'b',today));
 assert.throws(()=>moveLesson(old,input,[{day:input.from,status:'present',units:1}],'b',today),/출석/);
 assert.throws(()=>moveLesson(old,input,[{day:input.to,status:'travel',units:0}],'b',today),/여행/);
 const next=moveLesson(old,input,[{day:input.from,status:'travel',units:0}],'b',today);
 assert.equal(next.moves.length,1);assert.equal(old.moves.length,0);
});
test('schedule service is course-scoped, audited, concurrency-safe and preserved by tuition configuration',async()=>{
 const s=setup();await s.seed('piano',8);await s.seed('drums',4);
 const {seoulDay}=s.load('model');const start='2999-01-01';
 await s.service.saveSchedule({action:'saveSchedule',studentId:'piano',start,weekdays:[0,1,2,3,4,5,6]},'owner');
 let a=s.records.get('opsAccounts/piano');const revision=a.schedule.updatedAt;
 assert.equal(a.remaining,8);assert.equal(a.planUnits,8);assert.equal(a.planAmount,160000);assert.equal(s.records.get('opsAccounts/drums').schedule,undefined);
 const move={action:'moveLesson',studentId:'piano',from:start,to:seoulDay(),expectedUpdatedAt:revision};
 const results=await Promise.allSettled([s.service.saveSchedule(move,'owner'),s.service.saveSchedule(move,'owner')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 a=s.records.get('opsAccounts/piano');assert.equal(a.schedule.moves.length,1);
 assert.equal([...s.records.keys()].filter(k=>/^ops(Attendance|Invoices|Payments|Notices)\//.test(k)).length,0);
 const schedule=structuredClone(a.schedule);
 await s.service.configure({studentId:'piano',planUnits:12,planAmount:210000,remaining:99,phone:'01000001234',phones:['1234']},'owner');
 assert.deepEqual(s.records.get('opsAccounts/piano').schedule,schedule);assert.equal(s.records.get('opsAccounts/piano').remaining,8);
 const changes={accounts:[s.records.get('opsAccounts/piano')]};
 const applied=s.load('snapshot-changes').applySnapshotChanges({day:'2026-10-01',accounts:[],students:[],attendance:[],invoices:[]},changes);
 assert.deepEqual(applied.accounts[0].schedule,schedule);
 assert.equal([...s.records.values()].filter(v=>['lesson-schedule','move-lesson'].includes(v.action)).length,2);
});
test('returning an individually moved lesson after changing weekdays preserves the lesson',()=>{
 const {changeSchedule,moveLesson,plannedLesson}=setup().load('schedule'),today='2026-09-30';
 let s=changeSchedule(undefined,{start:'2026-10-01',weekdays:[4]},'a',today);
 s=moveLesson(s,{from:'2026-10-01',to:'2026-10-02',expectedUpdatedAt:'a'},[],'b',today);
 s=changeSchedule(s,{start:'2026-10-01',weekdays:[1],expectedUpdatedAt:'b'},'c',today);
 s=moveLesson(s,{from:'2026-10-02',to:'2026-10-01',expectedUpdatedAt:'c'},[],'d',today);
 assert.ok(plannedLesson(s,'2026-10-01'));assert.equal(plannedLesson(s,'2026-10-02'),null);
});

test('balance review detects missing imported lessons without double deducting live attendance or prepaid credits',()=>{
 const {reviewBalance}=setup().load('balance-review');
 const a={id:'p',name:'피아노',planUnits:12,remaining:15,openingAsOf:'2026-09-21',importId:'i',updatedAt:'u'};
 const source={id:'i',asOf:'2026-09-21',attendanceAsOf:'2026-09-23',attendanceCutoffs:{'2026-09':'2026-09-23'},remainingCandidate:4,planUnits:12,history:[{cells:[{day:'2026-09-19',value:'8',color:''},{day:'2026-09-23',value:'9',color:''}]}]};
 const audits=[{id:'a',studentId:'p',action:'import-opening-balance',at:'2026-09-21T00:00:00Z',detail:{remaining:4,asOf:'2026-09-21'}},{id:'b',studentId:'p',action:'payment',at:'2026-09-24T00:00:00Z',detail:{complete:true,invoiceId:'invoice'}},{id:'c',studentId:'p',action:'check-in',at:'2026-09-29T00:00:00Z',detail:{units:1,remaining:15}}];
 const records=[{studentId:'p',day:'2026-09-29',units:1,status:'present'}],invoices=[{id:'invoice',studentId:'p',units:12,status:'paid'}];
 let r=reviewBalance(a,source,audits,records,invoices);assert.equal(r.status,'correct');assert.equal(r.expected,14);assert.deepEqual(r.missingDays,['2026-09-23']);
 // A live record on the imported date is already included in the audit deductions.
 r=reviewBalance(a,source,audits,[{...records[0],day:'2026-09-23'}],invoices);assert.equal(r.status,'verified');assert.equal(r.expected,15);
});
test('balance review preserves explicit corrections and refuses ambiguous gaps, renewals and changed plans',()=>{
 const {reviewBalance}=setup().load('balance-review');
 const a={id:'p',name:'학생',planUnits:12,remaining:4,openingAsOf:'2026-09-21',importId:'i',updatedAt:'u'};
 const source={id:'i',asOf:'2026-09-23',remainingCandidate:4,planUnits:12,history:[{cells:[{day:'2026-09-19',value:'8',color:''},{day:'2026-09-23',value:'9',color:''}]}]};
 const audit={id:'a',studentId:'p',action:'import-opening-balance',at:'2026-09-21T00:00:00Z',detail:{remaining:4,asOf:'2026-09-21'}};
 const corrected={id:'b',studentId:'p',action:'correct-remaining',at:'2026-09-29T00:00:00Z',detail:{before:4,after:20,note:'원장 확인'}};
 const r=reviewBalance({...a,remaining:20},source,[audit,corrected],[],[]);assert.equal(r.status,'confirmed');assert.equal(r.expected,20);
 for(const value of ['1','11','보강','8']){const other=structuredClone(source);other.history[0].cells[1].value=value;assert.equal(reviewBalance(a,other,[audit],[],[]).status,'review');}
 assert.equal(reviewBalance({...a,planUnits:8},source,[audit],[],[]).status,'review');
 assert.equal(reviewBalance(a,source,[audit],[{studentId:'p',day:'2026-09-23',units:0,status:'cancelled'}],[]).status,'review');
 assert.equal(reviewBalance({...a,remaining:3},source,[audit],[],[]).status,'review');
});
test('reconciliation rechecks evidence atomically and cannot apply the same missing lesson twice',async()=>{
 const s=setup();await s.seed('p',4);
 const a=s.records.get('opsAccounts/p');Object.assign(a,{planUnits:12,openingAsOf:'2026-09-21',importId:'i'});
 s.records.set('opsAudit/opening',{studentId:'p',action:'import-opening-balance',at:'2026-09-21T00:00:00Z',detail:{remaining:4,asOf:'2026-09-21'}});
 // Remove seed configure audit so the fixture starts at its real opening event.
 for(const [k,v] of s.records)if(k.startsWith('opsAudit/')&&v.action==='configure')s.records.delete(k);
 const source={asOf:'2026-09-23',remainingCandidate:4,planUnits:12,attendanceRevision:1,history:[{cells:[{day:'2026-09-19',value:'8',color:''},{day:'2026-09-23',value:'9',color:''}]}]};s.records.set('opsImports/i',source);
 const report=()=>s.load('balance-review').reviewBalance(s.records.get('opsAccounts/p'),{...s.records.get('opsImports/i'),id:'i'},[...s.records].filter(([k])=>k.startsWith('opsAudit/')).map(([k,v])=>({...v,id:k.split('/')[1]})),[],[]);
 const r=report(),input={studentId:'p',remaining:3,expectedRemaining:4,expectedUpdatedAt:a.updatedAt,requestId:'reconcile-1',reconciliationFingerprint:r.fingerprint,note:r.reason};
 assert.equal(r.status,'correct');
 s.records.get('opsImports/i').attendanceRevision=2;
 await assert.rejects(s.service.correctRemaining(input,'owner'),/근거가 변경/);
 input.reconciliationFingerprint=report().fingerprint;
 await s.service.correctRemaining(input,'owner');await s.service.correctRemaining(input,'owner');
 assert.equal(s.records.get('opsAccounts/p').remaining,3);assert.equal(report().status,'confirmed');
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')||k.startsWith('opsAttendance/')).length,0);
});
test('balance review uses archived opening history for late entries before the import cutoff and paid renewal cycles',()=>{
 const {reviewBalance}=setup().load('balance-review');
 const cell=(day,n)=>({day,value:String(n),color:'FF000000'});
 const source={id:'i',asOf:'2026-09-21',attendanceCutoffs:{'2026-09':'2026-09-23'},remainingCandidate:1,planUnits:12,openingHistory:[{cells:[cell('2026-09-18',11)]}],history:[{cells:[cell('2026-09-18',11),cell('2026-09-21',12),cell('2026-09-23',1)]}]};
 const a={id:'p',name:'학생',planUnits:12,remaining:12,openingAsOf:'2026-09-21',importId:'i',updatedAt:'u'};
 const audits=[{id:'a',studentId:'p',action:'import-opening-balance',at:'2026-09-21T00:00:00Z',detail:{remaining:1,asOf:'2026-09-21'}},{id:'b',studentId:'p',action:'check-in',at:'2026-09-28T00:00:00Z',detail:{units:1,remaining:0}},{id:'c',studentId:'p',action:'payment',at:'2026-09-30T00:00:00Z',detail:{complete:true,invoiceId:'paid'}}];
 const records=[{studentId:'p',day:'2026-09-28',units:1,status:'present'}];
 const r=reviewBalance(a,source,audits,records,[{id:'paid',studentId:'p',status:'paid',units:12}]);
 assert.equal(r.status,'correct');assert.equal(r.expected,10);assert.deepEqual(r.missingDays,['2026-09-21','2026-09-23']);
 const noPayment=reviewBalance({...a,remaining:0},source,audits.slice(0,2),records,[]);assert.equal(noPayment.status,'review');
 const single={...source,planUnits:8,remainingCandidate:5,openingHistory:[{cells:[cell('2026-09-19',3)]}],history:[{cells:[cell('2026-09-19',3),cell('2026-09-21',4)]}]};
 const b={...a,planUnits:8,remaining:5};const events=[{...audits[0],detail:{remaining:5,asOf:'2026-09-21'}}];
 assert.equal(reviewBalance(b,single,events,[],[]).expected,4);
});

test('all matched imports resolve kiosk groups without a balance importId, with course and student isolation',async()=>{
 const s=setup();await s.seed('student-a',6);await s.seed('student-b',7);
 Object.assign(s.records.get('students/student-a'),{instruments:['피아노','드럼']});
 Object.assign(s.records.get('opsAccounts/student-a'),{subject:'피아노',name:'가상 학생 · 피아노'});
 const source={matchedStudentId:'student-a',subject:'어린이 피아노',asOf:'2026-09-23',history:[{section:'피아노(어린이)',cells:[{day:'2026-09-01'}]}]};
 s.records.set('opsImports/unlinked',source);
 s.records.set('opsImports/sibling',{...source,matchedStudentId:'student-b',history:[{section:'피아노(어린이)2관',cells:[{day:'2026-09-01'}]}]});
 const {courseGroup,checkInName}=s.load('course-label');
 const owner=s.records.get('students/student-a'),account=s.records.get('opsAccounts/student-a');
 assert.equal(courseGroup(account,owner,[source]),'어린이 피아노(1관)');
 assert.equal(checkInName({...account,subject:'드럼'},owner,[source]),'가상 학생 · 드럼');
 const lookup=await (await s.checkInPost({action:'lookup',digits:'1234'})).json();
 assert.equal(lookup.matches.find(m=>m.id==='student-a').name,'가상 학생 · 어린이 피아노 (1관)');
 const result=await s.service.checkIn('student-a','1234','device');
 assert.equal(result.name,'가상 학생 · 어린이 피아노 (1관)');
 assert.equal((await s.service.checkIn('student-a','1234','device')).name,result.name);
 assert.equal(s.records.get('opsAccounts/student-a').remaining,5);
 assert.equal(s.records.get('opsAccounts/student-b').remaining,7);
 owner.operationsCourseGroups={피아노:'어린이 피아노(2관)'};
 assert.equal((await s.service.checkIn('student-a','1234','device')).name,'가상 학생 · 어린이 피아노 (2관)');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,5);
});
test('conflicting import campuses remain unresolved and explicit manager assignments win',()=>{
 const s=setup(),{courseGroup,checkInName}=s.load('course-label');
 const account={subject:'피아노',name:'가상 학생 · 피아노'},owner={instruments:['피아노']};
 const source=section=>({subject:'어린이 피아노',asOf:'2026-09-23',history:[{section,cells:[{day:'2026-09-01'}]}]});
 const sources=[source('피아노(어린이)'),source('피아노(어린이)2관')];
 assert.equal(courseGroup(account,owner,sources),undefined);
 assert.equal(checkInName(account,owner,sources),'가상 학생 · 피아노 · 반 확인 필요');
 assert.equal(checkInName(account,{...owner,operationsCourseGroups:{피아노:'어린이 피아노(1관)'}},sources),'가상 학생 · 어린이 피아노 (1관)');
 assert.equal(courseGroup(account,{instruments:['피아노','어린이 피아노']},[sources[0]]),undefined);
});

test('unpaid invoice can change from 170000/8 to 230000/12 without duplicating an already reflected balance',async()=>{
 const s=setup();await s.seed('student-a',11);
 const account=s.records.get('opsAccounts/student-a');Object.assign(account,{planUnits:12,planAmount:230000});
 await s.service.createInvoice('student-a','owner');const id=account.openInvoiceId||s.records.get('opsAccounts/student-a').openInvoiceId;
 Object.assign(s.records.get(`opsInvoices/${id}`),{units:8,amount:170000});
 const before=structuredClone(s.records.get('opsAccounts/student-a')),cycleStart=s.load('model').seoulDay();
 await s.service.editInvoice({invoiceId:id,units:12,amount:230000,kind:'current',cycleStart,expectedUpdatedAt:'',note:'콩쿨반 전환'},'owner');
 const invoice=s.records.get(`opsInvoices/${id}`);
 assert.equal(invoice.amount,230000);assert.equal(invoice.units,12);assert.equal(invoice.creditUnits,0);assert.equal(invoice.cycleStart,cycleStart);
 assert.deepEqual(s.records.get('opsAccounts/student-a'),before);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsPayments/')||k.startsWith('opsNotices/')).length,0);
 const audit=[...s.records.values()].find(v=>v.action==='edit-invoice');assert.equal(audit.detail.before.amount,170000);assert.equal(audit.detail.after.amount,230000);
 await assert.rejects(s.service.payment({invoiceId:id,requestId:'stale',amount:170000,method:'카드'},'owner'),/청구 내용이 변경/);
 const payment={invoiceId:id,requestId:'new-payment',amount:230000,method:'카드',expectedInvoiceUpdatedAt:invoice.updatedAt};
 await s.service.payment(payment,'owner');await s.service.payment(payment,'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,11);
 assert.equal(s.records.get(`opsInvoices/${id}`).status,'paid');
 await assert.rejects(s.service.createCurrentCycleInvoice({studentId:'student-a',cycleStart,expectedUpdatedAt:s.records.get('opsAccounts/student-a').updatedAt},'owner'),/이미 있습니다/);
});
test('editing a new-pass invoice credits only its revised units and rejects stale edits or partial payments',async()=>{
 const s=setup();await s.seed('student-a',0);await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId;
 const input={invoiceId:id,units:12,amount:230000,kind:'next',expectedUpdatedAt:''};
 await s.service.editInvoice(input,'owner');const invoice=s.records.get(`opsInvoices/${id}`);
 assert.equal(invoice.creditUnits,12);
 await assert.rejects(s.service.editInvoice({...input,amount:240000},'owner'),/변경/);
 await s.service.payment({invoiceId:id,requestId:'part-edit',amount:100000,method:'현금',expectedInvoiceUpdatedAt:invoice.updatedAt},'owner');
 await assert.rejects(s.service.editInvoice({...input,expectedUpdatedAt:invoice.updatedAt},'owner'),/수납하지 않은/);
 await s.service.payment({invoiceId:id,requestId:'rest-edit',amount:130000,method:'현금',expectedInvoiceUpdatedAt:invoice.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,12);
});
test('invoice edits update unsent billing amounts without sending and reject uncertain delivery or invalid input',async()=>{
 const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId;
 const input={invoiceId:id,units:12,amount:230000,kind:'next',expectedUpdatedAt:''};
 const noticeId=`opsNotices/billing_${id}`;
 s.records.set(noticeId,{status:'blocked',parameters:{amount:'160000',lesson_count:'8',student_name:'가상 학생'}});
 await s.service.editInvoice(input,'owner');assert.equal(s.records.get(noticeId).status,'blocked');assert.equal(s.records.get(noticeId).parameters.amount,'230000');assert.equal(s.records.get(noticeId).parameters.lesson_count,'12');
 const revision=s.records.get(`opsInvoices/${id}`).updatedAt;
 for(const status of ['processing','submitted','unknown','failed']){
  s.records.get(noticeId).status=status;
  await assert.rejects(s.service.editInvoice({...input,amount:240000,expectedUpdatedAt:revision},'owner'),/발송 결과/);
 }
 for(const patch of [{amount:0},{units:-1},{kind:'bad'},{kind:'current',cycleStart:'bad'},{kind:'current',cycleStart:'2999-01-01'}])await assert.rejects(s.service.editInvoice({...input,...patch,expectedUpdatedAt:revision},'owner'));
 assert.equal(s.records.get(`opsInvoices/${id}`).amount,230000);
});
test('a payment racing an invoice edit cannot settle using obsolete terms',async()=>{
 const s=setup();await s.seed('student-a',0);await s.service.createInvoice('student-a','owner');const id=s.records.get('opsAccounts/student-a').openInvoiceId;
 const results=await Promise.allSettled([
  s.service.editInvoice({invoiceId:id,units:12,amount:230000,kind:'next',expectedUpdatedAt:''},'owner'),
  s.service.payment({invoiceId:id,requestId:'racing-payment',amount:160000,method:'현금'},'owner'),
 ]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
 assert.equal(s.records.get(`opsInvoices/${id}`).paid,0);assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
});

test('monthly attendance restores imported status colors without dimming normal lessons',()=>{
 const {legacyAttendanceAppearance: appearance}=setup().load('attendance-appearance');
 const row=(color,value='3')=>({studentId:'p',day:'2026-09-30',value,color});
 assert.equal(appearance(row('FF000000')).tone,'present');
 assert.equal(appearance(row('')).tone,'present');
 for(const color of ['FFCCCCCC','FFD9D9D9','FFB7B7B7'])assert.equal(appearance(row(color)).tone,'absent');
 assert.equal(appearance(row('FFFF9900')).tone,'makeup');
 for(const color of ['FFFF00FF','FF9900FF'])assert.equal(appearance(row(color)).tone,'payment-due');
 assert.equal(appearance(row('','결석')).tone,'absent');
 assert.equal(appearance(row('','보강')).tone,'makeup');
});
test('monthly payment color excludes completed passes and clears when settled',()=>{
 const {attendancePaymentDue: due}=setup().load('attendance-appearance');
 const a={remaining:-2};
 const inv={status:'open',amount:230000,paid:0,createdAt:'2026-09-28T15:30:00Z'};
 const row=(day,status='present',units=1)=>({day,status,units});
 assert.equal(due(row('2026-09-28'),a,inv),false);
 assert.equal(due(row('2026-09-29'),a,inv),false); // Last paid lesson, in Seoul time.
 assert.equal(due(row('2026-09-30'),a,inv),true);
 assert.equal(due(row('2026-09-30'),{remaining:3},inv),false); // Advance renewal.
 assert.equal(due(row('2026-09-30'),a,{...inv,paid:100000}),true);
 assert.equal(due(row('2026-09-30'),a,{...inv,status:'paid',paid:230000}),false);
 assert.equal(due(row('2026-09-30'),a,{...inv,status:'cancelled'}),false);
 const current={...inv,creditUnits:0,cycleStart:'2026-09-30'};
 assert.equal(due(row('2026-09-29'),{remaining:11},current),false);
 assert.equal(due(row('2026-09-30'),{remaining:11},current),true);
 assert.equal(due(row('2026-09-30','makeup'),{remaining:11},current),true);
 for(const status of ['absent','late_cancel','sick','travel','cancelled'])assert.equal(due(row('2026-09-30',status),a,current),false);
 assert.equal(due(row('2026-09-30','makeup',0),a,current),false);
 assert.equal(due(row('2026-09-30'),a,undefined),false);
});

test('paid first lessons are pink while unpaid first lessons stay purple',()=>{
 const {paidFirstLesson:first,importedAttendanceAppearance:appearance}=setup().load('attendance-appearance');
 assert.equal(first('1','present',false),false);
 assert.equal(first('1','present',false,true),true);
 assert.equal(first('8·1','present',false,true),true);
 assert.equal(first('1','makeup',false,true),false);
 assert.equal(first('1','present',true),false);
 assert.equal(first('11','present',false),false);
 assert.equal(first(undefined,'present',false),false);
 for(const status of ['absent','late_cancel','cancelled','travel','sick'])assert.equal(first('1',status,false),false);
 const row={studentId:'p',day:'2026-09-15',value:'1.0',color:'FFFF00FF'};
 const inv={status:'open',amount:230000,paid:100000,cycleStart:'2026-09-15',createdAt:'2026-09-15T00:00:00Z'};
 assert.equal(appearance(row,{remaining:11},inv).tone,'payment-due');
 assert.equal(appearance(row,{remaining:11},{...inv,status:'paid',paid:230000},true).tone,'paid-first');
 assert.equal(appearance(row,{remaining:11},undefined).tone,'payment-due');
 assert.equal(appearance(row,{remaining:11},{...inv,cycleStart:'2026-09-30'}).tone,'payment-due');
 assert.equal(appearance({...row,color:'FFD9D9D9'},{remaining:11},inv).tone,'absent');
 assert.equal(appearance({...row,value:'2',color:'FFFF9900'},{remaining:11},undefined).tone,'makeup');
});

test('October forecasts follow weekday rules and academy operating exceptions without changing balances',()=>{
 const {attendanceForecast:forecast}=setup().load('attendance-forecast');
 const schedule={rules:[{start:'2026-10-01',weekdays:[1,3,5,6]}],moves:[],updatedAt:'a'};
 const a={id:'p',active:true,planUnits:8,remaining:2,schedule};
 const dates=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
 const context={positions:{p:6},cycleStarts:[]};
 const before=structuredClone(a);
 const result=forecast([a],[],[],context,dates,'2026-09-30');
 assert.equal(result.get('p_2026-10-02'),'7');
 assert.equal(result.get('p_2026-10-03'),'8');
 assert.equal(result.has('p_2026-10-05'),false);
 assert.equal(result.get('p_2026-10-07'),'1');
 assert.equal(result.has('p_2026-10-09'),false);
 assert.equal(result.get('p_2026-10-10'),'2');
 assert.deepEqual(a,before);assert.deepEqual(context.positions,{p:6});
 assert.equal(forecast([{...a,schedule:undefined}],[],[],context,dates,'2026-09-30').size,0);
 assert.equal(forecast([{...a,active:false}],[],[],context,dates,'2026-09-30').size,0);
 const changed={...a,schedule:{...schedule,rules:[schedule.rules[0],{start:'2026-10-12',weekdays:[2,4]}],moves:[{from:'2026-10-02',to:'2026-10-01'}]}};
 const moved=forecast([changed],[],[],context,dates,'2026-09-30');
 assert.equal(moved.get('p_2026-10-01'),'7');assert.equal(moved.has('p_2026-10-02'),false);
 assert.equal(moved.has('p_2026-10-12'),false);assert.equal(moved.has('p_2026-10-13'),true);
});
test('actual attendance replaces forecasts and later forecasts use real deductions, leave, and renewal dates',()=>{
 const s=setup(),{attendanceForecast:forecast}=s.load('attendance-forecast'),{attendanceSequence:sequence}=s.load('attendance-sequence');
 const a={id:'p',active:true,planUnits:8,remaining:2,schedule:{rules:[{start:'2026-10-01',weekdays:[1,3,5,6]}],moves:[]}};
 const dates=Array.from({length:15},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`),context={positions:{p:6},cycleStarts:[]};
 const row=(day,units,status)=>({studentId:'p',day,units,status});
 const records=[row('2026-10-02',2,'present'),row('2026-10-03',0,'absent'),row('2026-10-07',0,'travel')];
 const result=forecast([a],records,[],context,dates,'2026-10-02');
 for(const r of records)assert.equal(result.has(`p_${r.day}`),false);
 assert.equal(sequence([a],records,[],context).labels.get('p_2026-10-02'),'7·8');
 assert.equal(result.get('p_2026-10-10'),'3');
 // Unrecorded past lessons are never counted as if the student attended.
 assert.equal(forecast([a],[],[],context,dates,'2026-10-10').get('p_2026-10-10'),'7');
 const renewed=forecast([a],records,[],{...context,cycleStarts:[{studentId:'p',day:'2026-10-12'}]},dates,'2026-10-02');
 assert.equal(renewed.get('p_2026-10-12'),'1');
 const imported=forecast([a],[],[{studentId:'p',day:'2026-10-02',value:'4',color:''}],context,dates,'2026-10-02');
 assert.equal(imported.has('p_2026-10-02'),false);assert.equal(imported.get('p_2026-10-03'),'5');
});
test('academy closure suppresses even moved lessons and rejects new moves to closed days',()=>{
 const {plannedLesson,moveLesson}=setup().load('schedule');
 const schedule={rules:[{start:'2026-10-01',weekdays:[1,4,6]}],moves:[],updatedAt:'a'};
 assert.ok(plannedLesson(schedule,'2026-10-03'));
 assert.equal(plannedLesson(schedule,'2026-10-05'),null);
 assert.equal(plannedLesson({...schedule,moves:[{from:'2026-10-01',to:'2026-10-05'}]},'2026-10-05'),null);
 assert.throws(()=>moveLesson(schedule,{from:'2026-10-01',to:'2026-10-05',expectedUpdatedAt:'a'},[],'b','2026-09-30'),/휴원/);
});

test('roster and monthly summaries retain current weekdays when viewing a month before setup', () => {
 const {scheduleSummary,plannedLesson}=setup().load('schedule');
 const schedule={rules:[{start:'2026-09-30',weekdays:[2,4]}],moves:[],updatedAt:'a'};
 assert.deepEqual(scheduleSummary(schedule,'2026-10-01'),{label:'주 2회 · 화·목',upcoming:[]});
 // Showing current weekdays must not backfill earlier calendar cells.
 assert.equal(plannedLesson(schedule,'2026-09-29'),null);
 assert.ok(plannedLesson(schedule,'2026-10-01'));
 const future={...schedule,rules:[{start:'2026-10-12',weekdays:[1,3,5]},...schedule.rules]};
 assert.deepEqual(scheduleSummary(future,'2026-10-01'),{label:'주 2회 · 화·목',upcoming:[{start:'2026-10-12',label:'주 3회 · 월·수·금'}]});
 assert.equal(scheduleSummary(future,'2026-10-12').label,'주 3회 · 월·수·금');
 assert.deepEqual(scheduleSummary({rules:[{start:'2026-10-12',weekdays:[2,4]}],moves:[]},'2026-10-01'),{label:'적용 예정',upcoming:[{start:'2026-10-12',label:'주 2회 · 화·목'}]});
 assert.equal(scheduleSummary(undefined,'2026-10-01').label,'요일 설정');
 assert.equal(scheduleSummary({...schedule,rules:[{start:'2026-09-30',weekdays:[]}]},'2026-10-01').label,'정규 수업 없음');
});

test('weekday edits from either list update only that course in the shared snapshot', () => {
 const s=setup(),{applySnapshotChanges,reconcileSnapshot}=s.load('snapshot-changes');
 const piano={id:'piano',schedule:{rules:[{start:'2026-09-30',weekdays:[2,4]}],moves:[],updatedAt:'a'}};
 const drums={id:'drums',schedule:{rules:[{start:'2026-09-30',weekdays:[3]}],moves:[],updatedAt:'b'}};
 const snapshot={day:'2026-09-01',accounts:[piano,drums],students:[],attendance:[],invoices:[]};
 const changed={...piano,schedule:{...piano.schedule,rules:[...piano.schedule.rules,{start:'2026-10-01',weekdays:[1,3,5]}],updatedAt:'c'}};
 const next=applySnapshotChanges(snapshot,{accounts:[changed]});
 assert.equal(next.accounts.find(a=>a.id==='piano').schedule,changed.schedule);
 assert.equal(next.accounts.find(a=>a.id==='drums'),drums);
 assert.equal(next.day,'2026-09-01');assert.equal(next.attendance,snapshot.attendance);
 assert.equal(reconcileSnapshot(next,structuredClone(next)),next);
});

test('snapshot revision detects schedule-only edits and removal without attendance changes', async () => {
 const {operationsRevision}=setup().load('revision');
 const state={opsAttendance:[],opsAccounts:[],opsLegacyCorrections:[]},queries=[];
 const db={collection(name){const query={orderBy(field,dir){queries.push([name,field,dir]);return query},limit(n){assert.equal(n,1);return query},select(){return query},async get(){return {docs:state[name]}}};return query}};
 const doc=(id,value,updateTime)=>({id,data:()=>value,updateTime});
 const empty=await operationsRevision(db);
 state.opsAccounts=[doc('piano',{schedule:{updatedAt:'2026-10-01T01:00:00Z'}},'1')];
 const saved=await operationsRevision(db);assert.notEqual(saved,empty);assert.equal(await operationsRevision(db),saved);
 state.opsAccounts=[doc('piano',{schedule:{updatedAt:'2026-10-01T01:01:00Z'}},'2')];
 const removed=await operationsRevision(db);assert.notEqual(removed,saved);
 state.opsAttendance=[doc('arrival',{updatedAt:'2026-10-01T01:02:00Z'},'3')];
 assert.notEqual(await operationsRevision(db),removed);
 assert.ok(queries.some(q=>q[0]==='opsAccounts'&&q[1]==='schedule.updatedAt'));
});

test('inactive course deletion and restoration preserve other courses, balances and financial history', async () => {
 const s=setup();s.records.set('students/person',{name:'가상',instruments:['피아노','드럼']});
 const piano=s.service.enrollmentId('person','피아노'),drums=s.service.enrollmentId('person','드럼');
 for(const [id,subject] of [[piano,'피아노'],[drums,'드럼']])await s.service.configure({studentId:id,sourceStudentId:'person',subject,planUnits:8,planAmount:160000,remaining:6,phone:'01000001234',phones:['1234']},'owner');
 const withdrawn=await s.service.changeLifecycle({sourceStudentId:'person',studentId:drums,status:'withdrawn',withdrawnOn:'2026-01-01',note:'시간 변경'},'owner');
 s.records.set('opsAttendance/old',{studentId:drums,day:'2026-01-01',units:1});
 s.records.set('opsInvoices/open',{studentId:drums,status:'open',amount:160000,paid:0});
 s.records.set('opsPayments/old',{studentId:drums,amount:160000});
 const ledger=()=>[...s.records].filter(([p])=>/^ops(Accounts|Attendance|Invoices|Payments|Notices)\//.test(p));
 const before=structuredClone(ledger());
 const input={action:'deleteEnrollment',sourceStudentId:'person',studentId:drums,expectedUpdatedAt:withdrawn.lifecycle.value.updatedAt};
 const deleted=await s.service.deleteEnrollment(input,'owner');
 assert.ok(deleted.lifecycle.value.deletedAt);assert.deepEqual(ledger(),before);
 assert.equal(s.load('lifecycle').enrollmentState(s.load('lifecycle').courseLifecycle(s.records.get('students/person'),piano)),'active');
 await assert.rejects(s.service.checkIn(drums,'1234','device'));
 await assert.rejects(s.service.changeLifecycle({...input,status:'active',expectedUpdatedAt:deleted.lifecycle.value.updatedAt},'owner'),/복원/);
 await assert.rejects(s.service.deleteEnrollment(input,'owner'),/변경/);
 const restored=await s.service.deleteEnrollment({...input,action:'restoreEnrollment',expectedUpdatedAt:deleted.lifecycle.value.updatedAt},'owner');
 assert.equal(restored.lifecycle.value.deletedAt,undefined);assert.equal(restored.lifecycle.value.status,'withdrawn');
 assert.equal(restored.lifecycle.value.withdrawnOn,'2026-01-01');assert.equal(restored.lifecycle.value.note,'시간 변경');assert.deepEqual(ledger(),before);
 assert.deepEqual([...s.records.values()].filter(v=>['delete-enrollment','restore-enrollment'].includes(v.action)).map(v=>v.action),['delete-enrollment','restore-enrollment']);
});

test('deletion rejects active, expired, foreign, stale and ambiguous courses', async () => {
 const s=setup();await s.seed('student-a',8);
 const base={action:'deleteEnrollment',sourceStudentId:'student-a',studentId:'student-a'};
 await assert.rejects(s.service.deleteEnrollment(base,'owner'),/휴원·퇴원/);
 await assert.rejects(s.service.deleteEnrollment({...base,studentId:'foreign'},'owner'),/과목/);
 s.records.get('students/student-a').instruments=['피아노','드럼'];
 await assert.rejects(s.service.deleteEnrollment(base,'owner'),/분리/);
 const {deleteOrRestoreEnrollment,enrollmentState}=s.load('lifecycle');
 const paused={status:'paused',until:'2026-10-02',note:'보관',updatedAt:'a'};
 await assert.rejects(s.service.deleteEnrollment({...base,sourceStudentId:'missing'},'owner'),/학생/);
 assert.throws(()=>deleteOrRestoreEnrollment(paused,{action:'deleteEnrollment',expectedUpdatedAt:'wrong'},'b','2026-10-01'),/변경/);
 assert.throws(()=>deleteOrRestoreEnrollment(paused,{action:'deleteEnrollment',expectedUpdatedAt:'a'},'b','2026-10-03'),/휴원·퇴원/);
 const deleted=deleteOrRestoreEnrollment(paused,{action:'deleteEnrollment',expectedUpdatedAt:'a'},'b','2026-10-01');
 assert.notEqual(enrollmentState(deleted,'2026-10-03'),'active');
 const restored=deleteOrRestoreEnrollment(deleted,{action:'restoreEnrollment',expectedUpdatedAt:'b'},'c','2026-10-03');
 assert.equal(enrollmentState(restored,'2026-10-03'),'active');assert.equal(restored.until,paused.until);
 assert.throws(()=>deleteOrRestoreEnrollment(restored,{action:'restoreEnrollment',expectedUpdatedAt:'c'},'d'),/삭제된/);
});

test('legacy corrections edit ordinal, status and note without charging imported lessons again', async () => {
 const s=setup(),sourceId='person',subject='피아노',id=s.service.enrollmentId(sourceId,subject),day='2026-09-19';
 s.records.set('students/person',{name:'가상',instruments:[subject,'드럼']});
 await s.service.configure({studentId:id,sourceStudentId:sourceId,subject,planUnits:8,planAmount:160000,remaining:2,phone:'01000001234',phones:['1234']},'owner');
 const raw={studentId:id,day,value:'5.0',color:''};
 const source={matchedStudentId:sourceId,subject,asOf:'2026-09-22',history:[{cells:[raw]}]};
 s.records.set('opsImports/piano',source);
 const before=structuredClone([...s.records]);
 const {correctedLegacy}=s.load('legacy-correction');
 const input={studentId:id,day,status:'present',ordinal:4,note:'회차 정정',expectedRevision:correctedLegacy(raw).revision};
 await s.service.correctLegacyAttendance(input,'owner');
 const saved=s.records.get(`opsLegacyCorrections/${id}_${day}`);
 assert.equal(saved.value,'4');assert.equal(saved.note,'회차 정정');
 for(const [path,value] of before)assert.deepEqual(s.records.get(path),value);
 assert.equal([...s.records.keys()].some(p=>/^ops(Attendance|Notices|Invoices)\//.test(p)),false);
 await assert.rejects(s.service.correctLegacyAttendance(input,'owner'),/변경/);
 const cancelled={...input,status:'cancelled',ordinal:'',expectedRevision:correctedLegacy(raw,saved).revision};
 await s.service.correctLegacyAttendance(cancelled,'owner');
 const removed=s.records.get(`opsLegacyCorrections/${id}_${day}`);
 assert.equal(removed.value,'');assert.equal(removed.status,'cancelled');
 await s.service.correctLegacyAttendance({...input,expectedRevision:correctedLegacy(raw,removed).revision},'owner');
 assert.equal(s.records.get(`opsLegacyCorrections/${id}_${day}`).status,'present');
 // Refreshing the spreadsheet source does not erase the correction; its new revision rejects stale editors.
 const changedOriginal={...raw,value:'6.0'};
 assert.equal(correctedLegacy(changedOriginal,saved).value,'4');
 assert.notEqual(correctedLegacy(changedOriginal,saved).revision,correctedLegacy(raw,saved).revision);
 const drums=s.service.enrollmentId(sourceId,'드럼');
 await s.service.configure({studentId:drums,sourceStudentId:sourceId,subject:'드럼',planUnits:4,planAmount:160000,remaining:2,phone:'01000001234',phones:['1234']},'owner');
 await assert.rejects(s.service.correctLegacyAttendance({...input,studentId:drums},'owner'),/이전 장부/);
 s.records.set(`opsAttendance/${id}_${day}`,{studentId:id,day,units:1});
 await assert.rejects(s.service.correctLegacyAttendance(input,'owner'),/직접 입력/);
});

test('corrected legacy cells reserve missed lessons while cancelled cells do not advance', () => {
 const s=setup(),{correctedLegacy,legacyCorrectionInput}=s.load('legacy-correction');
 const {attendanceSequence}=s.load('attendance-sequence');
 const raw={studentId:'p',day:'2026-09-19',value:'5.0',color:''};
 const next={studentId:'p',day:'2026-09-21',units:1,status:'present'};
 const corrected=correctedLegacy(raw,{...raw,...legacyCorrectionInput({status:'present',ordinal:4}),updatedAt:'a'});
 assert.equal(attendanceSequence([{id:'p',planUnits:8}],[next],[corrected]).labels.get('p_2026-09-21'),'5');
 for(const status of ['cancelled','absent','travel','sick']){
  const cell=correctedLegacy(raw,{...raw,...legacyCorrectionInput({status,ordinal:''}),updatedAt:'b'});
  assert.equal(attendanceSequence([{id:'p',planUnits:8}],[next],[cell],{positions:{p:3},cycleStarts:[]}).labels.get('p_2026-09-21'),status==='cancelled'?'4':'5');
 }
 const {importedAttendanceAppearance}=s.load('attendance-appearance');
 assert.equal(importedAttendanceAppearance({...corrected,status:'cancelled'}).tone,'cancelled');
 for(const ordinal of [0,-1,1.5,201])assert.throws(()=>legacyCorrectionInput({status:'present',ordinal}));
 assert.throws(()=>legacyCorrectionInput({status:'present',ordinal:''}));assert.throws(()=>legacyCorrectionInput({status:'unknown',ordinal:1}));
});


test('gray imported absences anchor the next lesson for every course, independent of balance',()=>{
 const {attendanceSequence:sequence}=setup().load('attendance-sequence');
 for(const color of ['FFCCCCCC','FFD9D9D9','FFB7B7B7','#cccccc']){
  const accounts=[{id:'osw',planUnits:4,remaining:3},{id:'other',planUnits:8}];
  const legacy=[{studentId:'osw',day:'2026-09-11',value:'1.0',color:''},{studentId:'osw',day:'2026-09-18',value:'2.0',color},{studentId:'other',day:'2026-09-18',value:'8',color}];
  const rows=accounts.map(a=>({studentId:a.id,day:'2026-10-02',units:1}));
  const before=JSON.stringify({accounts,legacy,rows});
  const prior=sequence(accounts,[],legacy);
  const result=sequence(accounts,rows,[],{...prior,cycleStarts:[]});
  assert.equal(result.labels.get('osw_2026-10-02'),'3');
  assert.equal(result.labels.get('other_2026-10-02'),'1');
  assert.equal(JSON.stringify({accounts,legacy,rows}),before);
 }
});

test('makeup fills a missed ordinal across months and renewal without shifting regular lessons',()=>{
 const {attendanceSequence:sequence}=setup().load('attendance-sequence');
 const accounts=[{id:'p',planUnits:4}];
 const prior=sequence(accounts,[{studentId:'p',day:'2026-09-30',units:0,status:'absent'}],[{studentId:'p',day:'2026-09-29',value:'3',color:''}]);
 assert.equal(prior.labels.get('p_2026-09-30'),'4');
 for(const units of [0,1]){
  const rows=[{studentId:'p',day:'2026-10-01',units:1,status:'present'},{studentId:'p',day:'2026-10-02',units,status:'makeup',relatedDay:'2026-09-30'},{studentId:'p',day:'2026-10-03',units:1,status:'present'}];
  const result=sequence(accounts,rows,[],{...prior,cycleStarts:[{studentId:'p',day:'2026-10-01'}]});
  assert.equal(result.labels.get('p_2026-10-01'),'1');
  assert.equal(result.labels.get('p_2026-10-02'),'4');
  assert.equal(result.labels.get('p_2026-10-03'),'2');
  rows[1].relatedDay='2026-09-29';
  assert.equal(sequence(accounts,rows,[],{...prior,cycleStarts:[]}).labels.has('p_2026-10-02'),false);
 }
 // Orange imported makeup cannot overwrite the regular ordinal.
 const legacy=[{studentId:'p',day:'2026-09-28',value:'3',color:''},{studentId:'p',day:'2026-09-29',value:'1',color:'FFFF9900'}];
 assert.equal(sequence(accounts,[{studentId:'p',day:'2026-09-30',units:1}],legacy).labels.get('p_2026-09-30'),'4');
});

test('vacation ranges reserve only actual class days, including moves and excluding academy closures',()=>{
 const s=setup(),{attendanceSequence:sequence}=s.load('attendance-sequence'),{attendanceForecast:forecast}=s.load('attendance-forecast');
 const account={id:'p',planUnits:8,active:true,schedule:{rules:[{start:'2026-09-01',weekdays:[2,4]}],moves:[{from:'2026-10-06',to:'2026-10-07'}],updatedAt:'a'}};
 const dates=Array.from({length:8},(_,i)=>`2026-10-0${i+1}`);
 const records=dates.slice(0,7).map(day=>({studentId:'p',day,units:0,status:'travel',range:{id:'r',start:dates[0],end:dates[6]}}));
 const result=sequence([account],records,[],{positions:{p:2},cycleStarts:[]});
 assert.equal(result.labels.get('p_2026-10-01'),'3');
 assert.equal(result.labels.get('p_2026-10-07'),'4');
 assert.equal(result.labels.size,2);
 assert.equal(forecast([account],records,[],{positions:{p:2},cycleStarts:[]},dates,'2026-10-01').get('p_2026-10-08'),'5');
 const closed={...account,schedule:{...account.schedule,rules:[{start:'2026-09-01',weekdays:[1]}],moves:[]}};
 assert.equal(sequence([closed],records,[]).labels.size,0); // October 5 is closed.
 // Removing a reservation removes its ordinal and recalculates the next class.
 const cancelled=records.map(r=>({...r,status:'cancelled'}));
 assert.equal(forecast([account],cancelled,[],{positions:{p:2},cycleStarts:[]},dates,'2026-10-01').get('p_2026-10-08'),'3');
});


test('first-lesson colors require full payment for that course and that cycle, never absence of an invoice',()=>{
 const s=setup(),{confirmedFirstLessons:confirmed,importedAttendanceAppearance:appearance}=s.load('attendance-appearance');
 const cycles={drums:['2026-08-31','2026-09-28','2026-10-26'],piano:['2026-09-28']};
 const invoice={id:'i',studentId:'drums',amount:160000,paid:0,status:'open',createdAt:'2026-09-21T02:00:00Z',needsReview:false};
 assert.equal(confirmed([invoice],cycles).size,0);
 assert.equal(confirmed([{...invoice,paid:80000}],cycles).size,0);
 const paid={...invoice,status:'paid',paid:160000};
 assert.deepEqual([...confirmed([paid],cycles)],['drums_2026-09-28']);
 assert.equal(confirmed([paid],cycles).has('drums_2026-10-26'),false);
 assert.equal(confirmed([paid],cycles).has('piano_2026-09-28'),false);
 for(const patch of [{status:'cancelled'},{paid:80000},{needsReview:true}])assert.equal(confirmed([{...paid,...patch}],cycles).size,0);
 assert.equal(confirmed([paid,{...invoice,id:'other',cycleStart:'2026-09-28'}],cycles).size,0);
 // Explicit late collection marks the intended earlier cycle, not the next one.
 assert.deepEqual([...confirmed([{...paid,createdAt:'2026-10-02T00:00:00Z',cycleStart:'2026-09-28'}],cycles)],['drums_2026-09-28']);
 for(const color of ['', 'FFFF00FF']){
  const row={studentId:'drums',day:'2026-09-28',value:'1.0',color};
  assert.equal(appearance(row).tone,'payment-due');
  assert.equal(appearance(row,undefined,undefined,true).tone,'paid-first');
  assert.equal(appearance({...row,status:'absent'},undefined,undefined,true).tone,'absent');
 }
});

test('cycle dates survive month changes so old payments cannot confirm a later first lesson',()=>{
 const s=setup(),{attendanceSequence:sequence}=s.load('attendance-sequence'),{confirmedFirstLessons:confirmed}=s.load('attendance-appearance');
 const a=[{id:'drums',planUnits:4}];
 const prior=sequence(a,[],[{studentId:'drums',day:'2026-09-01',value:'1',color:''},{studentId:'drums',day:'2026-09-28',value:'4',color:''}]);
 const next=sequence(a,[{studentId:'drums',day:'2026-10-01',units:1,status:'present'}],[],{...prior,cycleStarts:[]});
 assert.deepEqual(next.cycleFirstDays.drums,['2026-09-01','2026-10-01']);
 const invoice={id:'i',studentId:'drums',createdAt:'2026-08-28T00:00:00Z',status:'paid',amount:160000,paid:160000,needsReview:false};
 assert.deepEqual([...confirmed([invoice],next.cycleFirstDays)],['drums_2026-09-01']);
 assert.deepEqual(prior.cycleFirstDays.drums,['2026-09-01']);
});


test('unpaid attendance loop: mark, edit, repeat, cancel and later collect without duplicate deductions',async()=>{
 const s=setup();await s.seed('student-a',8);
 const day='2026-09-01';
 const base={studentId:'student-a',day,status:'present',units:1,note:'',relatedDay:'',unpaidCycleStart:day};
 const first=await s.service.recordAttendance(base,'owner');
 assert.equal(first.accounts[0].remaining,7);
 assert.equal(first.attendance[0].status,'present');
 assert.equal(first.attendance[0].unpaidCycleStart,day);
 await s.service.recordAttendance({...base,expectedUpdatedAt:first.attendance[0].updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 // Marking an existing two-lesson attendance must keep both existing deductions.
 const two=await s.service.recordAttendance({...base,units:2,unpaidCycleStart:'',expectedUpdatedAt:first.attendance[0].updatedAt},'owner');
 const marked=await s.service.recordAttendance({...base,units:2,expectedUpdatedAt:two.attendance[0].updatedAt},'owner');
 assert.equal(marked.accounts[0].remaining,6);
 const cancelled=await s.service.recordAttendance({...base,status:'cancelled',units:0,expectedUpdatedAt:marked.attendance[0].updatedAt},'owner');
 assert.equal(cancelled.accounts[0].remaining,8);assert.equal(cancelled.attendance[0].unpaidCycleStart,'');
 const restored=await s.service.recordAttendance({...base,expectedUpdatedAt:cancelled.attendance[0].updatedAt},'owner');
 await s.service.createCurrentCycleInvoice({studentId:'student-a',cycleStart:day,expectedUpdatedAt:restored.accounts[0].updatedAt},'owner');
 const invoice=[...s.records.values()].find(r=>r.cycleStart===day && r.status==='open');
 await s.service.payment({invoiceId:invoice.id,requestId:'partial-unpaid',amount:80000,method:'현금'},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 await s.service.payment({invoiceId:invoice.id,requestId:'full-unpaid',amount:80000,method:'현금'},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,7);
 const {confirmedFirstLessons,unpaidAttendanceCycles}=s.load('attendance-appearance');
 const confirmed=confirmedFirstLessons([s.records.get(`opsInvoices/${invoice.id}`)],{'student-a':[day]});
 assert.equal(unpaidAttendanceCycles([restored.attendance[0]],confirmed).size,0);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,0);
});

test('unpaid flags last across months, partial payment and other courses; cancellation and matching full payment clear them',()=>{
 const s=setup(),{unpaidAttendanceCycles:pending,isUnpaidAttendance:unpaid,confirmedFirstLessons:confirmed}=s.load('attendance-appearance');
 const start='2026-09-01',key=`drums_${start}`;
 const row=(day,extra={})=>({studentId:'drums',day,status:'present',units:1,...extra});
 const marked=row(start,{unpaidCycleStart:start});
 const cycles={drums:[start,'2026-10-15']};
 const prior=pending([marked],new Set());
 const next=pending([],new Set(),[...prior]);
 assert.equal(unpaid(row('2026-10-01'),cycles,next),true);
 assert.equal(unpaid(row('2026-10-01'),{},next),true); // No old first-lesson date available.
 assert.equal(unpaid(row('2026-10-15'),cycles,next),false); // Separate next pass.
 assert.equal(unpaid(row('2026-10-01',{studentId:'piano'}),cycles,next),false);
 assert.equal(unpaid(row('2026-10-01',{status:'absent'}),cycles,next),false);
 assert.equal(pending([{...marked,status:'cancelled'}],new Set()).size,0);
 const invoice={studentId:'drums',cycleStart:start,createdAt:'2026-09-01T00:00:00Z',amount:160000,paid:80000,status:'open',needsReview:false};
 assert.equal(pending([],confirmed([invoice],cycles),[key]).has(key),true);
 assert.equal(pending([],confirmed([{...invoice,status:'paid',paid:160000}],cycles),[key]).size,0);
 const {attendanceInput}=s.load('model');
 assert.throws(()=>attendanceInput({...marked,unpaidCycleStart:'2026-09-02'}),/수강권 시작일/);
 assert.throws(()=>attendanceInput({...marked,units:0}),/수강권 시작일/);
 assert.throws(()=>attendanceInput({...marked,day:'2999-01-01'}),/미래/);
});


test('linking a first lesson date preserves financial state, review flags and lesson chronology',async()=>{
 const s=setup();await s.seed('date-link',0);await s.service.createInvoice('date-link','owner');
 const id=s.records.get('opsAccounts/date-link').openInvoiceId;
 s.records.get(`opsInvoices/${id}`).needsReview=true;
 const beforeAccount=structuredClone(s.records.get('opsAccounts/date-link')),before=structuredClone(s.records.get(`opsInvoices/${id}`));
 const result=await s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-16'},'owner');
 const invoice=result.invoices[0];assert.equal(invoice.lessonDate,'2026-09-16');assert.equal(invoice.cycleStart,undefined);
 for(const field of ['units','creditUnits','amount','paid','status','needsReview'])assert.equal(invoice[field],before[field]);
 assert.deepEqual(s.records.get('opsAccounts/date-link'),beforeAccount);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsPayments/')||k.startsWith('opsNotices/')||k.startsWith('opsAttendance/')),false);
 assert.equal(s.load('billing-display').invoiceCycleStart(invoice,{}),'2026-09-16');
 assert.equal(s.load('attendance-appearance').confirmedFirstLessons([invoice],{}).size,0);
 assert.equal(s.load('attendance-appearance').confirmedFirstLessons([{...invoice,status:'paid',paid:invoice.amount,needsReview:false}],{}).has('date-link_2026-09-16'),true);
 const current=invoice.updatedAt;
 await s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-16',expectedUpdatedAt:current},'owner');
 assert.equal([...s.records.values()].filter(r=>r.action==='invoice-lesson-date').length,1);
 await assert.rejects(s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-17',expectedUpdatedAt:''},'owner'),/변경/);
 for(const lessonDate of ['','bad','2026-02-30'])await assert.rejects(s.service.linkInvoiceLesson({invoiceId:id,lessonDate,expectedUpdatedAt:current},'owner'));
});
test('date linking rejects another paid invoice for the same course and cycle but leaves other courses independent',async()=>{
 const s=setup();await s.seed('piano',8);await s.service.createInvoice('piano','owner');const id=s.records.get('opsAccounts/piano').openInvoiceId;
 const paid={id:'paid',studentId:'piano',status:'paid',lessonDate:'2026-09-16'};s.records.set('opsInvoices/paid',paid);
 await assert.rejects(s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-16'},'owner'),/다른 청구/);
 assert.equal(s.records.get(`opsInvoices/${id}`).lessonDate,undefined);
 s.records.get('opsInvoices/paid').studentId='drums';
 await s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-16'},'owner');
 const changed=s.records.get(`opsInvoices/${id}`);
 await s.service.payment({invoiceId:id,requestId:'linked-payment',amount:160000,method:'현금',expectedInvoiceUpdatedAt:changed.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,16);
 await assert.rejects(s.service.linkInvoiceLesson({invoiceId:id,lessonDate:'2026-09-17',expectedUpdatedAt:changed.updatedAt},'owner'),/진행 중/);
});
test('actual payment date is stored separately from entry time and retries cannot change it',async()=>{
 const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');
 const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
 const request={invoiceId,requestId:'backdated',amount:60000,method:'현금',paymentDate:'2026-09-16'};
 await s.service.payment(request,'owner');await s.service.payment(request,'owner');
 const payment=s.records.get('opsPayments/backdated');
 assert.equal(payment.paymentDate,'2026-09-16');assert.ok(payment.at.startsWith(s.load('model').seoulDay().slice(0,7)));
 assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 await assert.rejects(s.service.payment({...request,paymentDate:'2026-09-17'},'owner'),/중복 요청/);
 for(const paymentDate of ['2999-01-01','2026-02-30','','bad'])await assert.rejects(s.service.payment({...request,requestId:'invalid-date',paymentDate},'owner'));
 assert.equal(s.records.has('opsPayments/invalid-date'),false);
 await s.service.payment({...request,requestId:'final-date',amount:100000,paymentDate:'2026-09-18'},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,9);
 assert.equal(s.records.get('opsPayments/final-date').paymentDate,'2026-09-18');
 const {paymentDay,courseInitial,invoiceCycleStart}=s.load('billing-display');
 assert.equal(paymentDay(payment),'2026-09-16');
 assert.equal(paymentDay({at:'2026-09-16T23:30:00Z'}),'2026-09-17');
 for(const [subject,initial] of [['어린이 피아노(1관)','PF(1)'],['어린이 피아노 (2관)','PF(2)'],['성인 피아노','PF(A)'],['드럼','D'],['우쿨렐레','UK'],['보컬','V'],['기타','G']])assert.equal(courseInitial(subject),initial);
 assert.equal(invoiceCycleStart({studentId:'p',createdAt:'2026-09-15T01:00:00Z'},{}),undefined);
 assert.equal(invoiceCycleStart({studentId:'p',createdAt:'2026-09-15T01:00:00Z'},{p:['2026-09-01','2026-09-16']}),'2026-09-16');
});

test('future makeup reserves the missed ordinal without attendance, credit or duplicate bookings',async()=>{
 const s=setup();await s.seed('piano',3);await s.seed('drums',3);
 const source='2026-10-01',target='2999-01-10';
 for(const studentId of ['piano','drums'])await s.service.recordAttendance({studentId,day:source,status:'travel',units:0},'owner');
 const booking={studentId:'piano',day:target,status:'makeup_reserved',units:0,relatedDay:source,note:'5회차 보강',expectedUpdatedAt:''};
 await Promise.all([s.service.recordAttendance(booking,'owner'),s.service.recordAttendance(booking,'owner')]);
 const saved=s.records.get(`opsAttendance/piano_${target}`);
 assert.equal(saved.status,'makeup_reserved');assert.equal(saved.units,0);assert.equal(s.records.get('opsAccounts/piano').remaining,3);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')||k.startsWith('opsInvoices/')),false);
 const recordRows=[...s.records].filter(([key])=>key.startsWith('opsAttendance/')).map(([,value])=>value);
 const {attendanceSequence}=s.load('attendance-sequence');
 const earlier=attendanceSequence([{id:'piano',planUnits:8}],recordRows.filter(r=>r.day===source),[],{positions:{piano:4},cycleStarts:[]});
 const future=attendanceSequence([{id:'piano',planUnits:8}],[saved,{studentId:'piano',day:'2999-01-11',status:'present',units:1}],[],{...earlier,cycleStarts:[]});
 assert.equal(earlier.labels.get(`piano_${source}`),'5');assert.equal(future.labels.get(`piano_${target}`),'5');assert.equal(future.labels.get('piano_2999-01-11'),'6');
 await assert.rejects(s.service.recordAttendance({...booking,day:'2999-01-12'},'owner'),/이미/);
 await s.service.recordAttendance({...booking,studentId:'drums'},'owner');
 await assert.rejects(s.service.adjust({attendanceId:saved.id,units:1},'owner'),/보강 예약/);
 await assert.rejects(s.service.recordAttendanceRange({studentId:'piano',start:target,end:target,status:'travel',rangeId:'trip',revisions:{[target]:saved.updatedAt}},'owner'),/출석/);
 await s.service.recordAttendance({...booking,status:'cancelled',expectedUpdatedAt:saved.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,3);
 await s.service.recordAttendance({...booking,day:'2999-01-12'},'owner');
 assert.equal(s.records.get(`opsAttendance/piano_${source}`).status,'travel');
});

test('reserved makeup becomes one kiosk arrival and one deduction, even for simultaneous taps',async()=>{
 const s=setup();await s.seed('piano',3);const today=s.load('model').seoulDay(),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 await s.service.recordAttendance({studentId:'piano',day:yesterday,status:'travel',units:0},'owner');
 await s.service.recordAttendance({studentId:'piano',day:today,status:'makeup_reserved',units:0,relatedDay:yesterday,note:'예약 비고'},'owner');
 const planned=s.records.get(`opsAttendance/piano_${today}`);
 assert.equal(s.load('daily-checkins').dailyCheckins([planned],today).length,0);
 const results=await Promise.all([s.service.checkIn('piano','1234','device'),s.service.checkIn('piano','1234','device')]);
 assert.equal(results.filter(r=>!r.duplicate).length,1);assert.equal(s.records.get('opsAccounts/piano').remaining,2);
 const completed=s.records.get(`opsAttendance/${planned.id}`);
 assert.equal(completed.status,'makeup');assert.equal(completed.source,'kiosk');assert.equal(completed.relatedDay,yesterday);assert.equal(completed.note,'예약 비고');
 assert.equal(s.load('daily-checkins').dailyCheckins([completed],today).length,1);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/attendance_')).length,1);
 await assert.rejects(s.service.recordAttendance({studentId:'piano',day:'2999-01-01',status:'makeup_reserved',units:0,relatedDay:yesterday},'owner'),/이미/);
});

test('charged absences are not charged twice, and cancelled originals cannot complete a reservation',async()=>{
 for(const kiosk of [false,true]){
  const s=setup();await s.seed('piano',3);const today=s.load('model').seoulDay(),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  await s.service.recordAttendance({studentId:'piano',day:yesterday,status:'late_cancel',units:1},'owner');
  await s.service.recordAttendance({studentId:'piano',day:today,status:'makeup_reserved',units:0,relatedDay:yesterday},'owner');
  const booked=s.records.get(`opsAttendance/piano_${today}`);
  if(kiosk)await s.service.checkIn('piano','1234','device');
  else await s.service.recordAttendance({studentId:'piano',day:today,status:'makeup',units:1,relatedDay:yesterday,expectedUpdatedAt:booked.updatedAt},'owner');
  assert.equal(s.records.get('opsAccounts/piano').remaining,2);assert.equal(s.records.get(`opsAttendance/piano_${today}`).units,0);
 }
 const s=setup();await s.seed('piano',3);const today=s.load('model').seoulDay(),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 await s.service.recordAttendance({studentId:'piano',day:yesterday,status:'absent',units:0},'owner');
 await s.service.recordAttendance({studentId:'piano',day:today,status:'makeup_reserved',units:0,relatedDay:yesterday},'owner');
 await s.service.recordAttendance({studentId:'piano',day:yesterday,status:'cancelled',units:0,expectedUpdatedAt:s.records.get(`opsAttendance/piano_${yesterday}`).updatedAt},'owner');
 await assert.rejects(s.service.checkIn('piano','1234','device'),/원래/);
 assert.equal(s.records.get('opsAccounts/piano').remaining,3);assert.equal(s.records.get(`opsAttendance/piano_${today}`).status,'makeup_reserved');
});

test('future makeup validates date, source and charge before writing any booking',async()=>{
 const s=setup();await s.seed('piano',3);const book={studentId:'piano',day:'2999-01-10',status:'makeup_reserved',units:0,relatedDay:'2026-09-01'};
 for(const patch of [{units:1},{relatedDay:''},{relatedDay:'2999-01-10'},{relatedDay:'2999-01-11'},{status:'makeup'},{status:'present'}])await assert.rejects(s.service.recordAttendance({...book,...patch},'owner'));
 await assert.rejects(s.service.recordAttendance(book,'owner'),/원래/);
 await s.service.recordAttendance({studentId:'piano',day:book.relatedDay,status:'present',units:1},'owner');
 await assert.rejects(s.service.recordAttendance(book,'owner'),/원래/);
 assert.equal(s.records.has('opsAttendance/piano_2999-01-10'),false);
 assert.equal(s.records.get('opsAccounts/piano').remaining,2);
});

test('a legacy missed class can be reserved and later corrected imports are respected',async()=>{
 const s=setup();const owner='legacy-owner',studentId=s.service.enrollmentId(owner,'피아노');
 s.records.set(`students/${owner}`,{name:'가상 학생',instruments:['피아노'],phone:'01000001234'});
 await s.service.configure({studentId,sourceStudentId:owner,subject:'피아노',planUnits:8,planAmount:160000,remaining:3,phone:'01000001234',phones:['1234'],active:true},'owner');
 s.records.set('opsImports/legacy-booking',{matchedStudentId:owner,subject:'어린이 피아노',asOf:'2026-09-30',history:[{cells:[{day:'2026-09-18',value:'5',color:'FFCCCCCC'}]}]});
 const book={studentId,day:'2999-01-10',status:'makeup_reserved',units:0,relatedDay:'2026-09-18'};
 await s.service.recordAttendance(book,'owner');assert.equal(s.records.get(`opsAccounts/${studentId}`).remaining,3);
 s.records.set(`opsLegacyCorrections/${studentId}_2026-09-18`,{studentId,day:'2026-09-18',status:'cancelled',value:'',color:'',updatedAt:'changed'});
 const old=s.records.get(`opsAttendance/${studentId}_2999-01-10`);
 await s.service.recordAttendance({...book,status:'cancelled',expectedUpdatedAt:old.updatedAt},'owner');
 await assert.rejects(s.service.recordAttendance({...book,day:'2999-01-11'},'owner'),/원래/);
});

test('plan sync repairs an existing mismatch without altering dates, paid history, or another course',async()=>{
 const s=setup();await s.seed();await s.seed('drums',4);await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId;
 Object.assign(s.records.get(`opsInvoices/${id}`),{creditUnits:0,cycleStart:'2026-09-19',lessonDate:'2026-09-19',needsReview:true});
 s.records.get('opsAccounts/student-a').planAmount=190000; // fee already saved by the old UI
 s.records.set('opsInvoices/paid-history',{id:'paid-history',studentId:'student-a',units:4,amount:140000,paid:140000,status:'paid'});
 s.records.set('opsInvoices/cancelled-history',{id:'cancelled-history',studentId:'student-a',units:4,amount:140000,paid:0,status:'cancelled'});
 s.records.set('opsInvoices/older-arrears',{id:'older-arrears',studentId:'student-a',units:4,amount:140000,paid:0,status:'open'});
 await s.service.createInvoice('drums','owner');
 const protectedRows=[...s.records].filter(([k])=>k.startsWith('opsInvoices/')&&k!==`opsInvoices/${id}`||k==='opsAccounts/drums');
 const invoiceBefore=structuredClone(s.records.get(`opsInvoices/${id}`));
 const changes=await s.service.configure({studentId:'student-a',planUnits:8,planAmount:190000,phone:'01000001234',phones:['1234'],syncOpenInvoice:true},'owner');
 const revised=s.records.get(`opsInvoices/${id}`);
 assert.deepEqual(revised,{...invoiceBefore,amount:190000,updatedAt:revised.updatedAt});
 assert.ok(revised.updatedAt);assert.deepEqual(changes.invoices,[revised]);assert.equal(s.records.get('opsAccounts/student-a').remaining,1);
 for(const [k,v] of protectedRows)assert.deepEqual(s.records.get(k),v);
 // The next save is idempotent for the invoice and does not emit a second billing audit.
 const repeated=await s.service.configure({studentId:'student-a',planUnits:8,planAmount:190000,phone:'01000001234',phones:['1234'],syncOpenInvoice:true},'owner');
 assert.equal(repeated.invoices,undefined);assert.deepEqual(s.records.get(`opsInvoices/${id}`),revised);
 const audits=[...s.records.values()].filter(v=>v.action==='configure-invoice');assert.equal(audits.length,1);
 const allAudits=[...s.records].filter(([k])=>k.startsWith('opsAudit/')).map(([id,v])=>({id,...v}));
 const review=s.load('balance-review').reviewBalance(s.records.get('opsAccounts/student-a'),undefined,allAudits,[],[revised]);
 assert.equal(review.status,'verified');assert.equal(review.expected,1);
});
test('plan sync preserves a partial receipt and only the revised unpaid remainder can settle',async()=>{
 const s=setup();await s.seed('student-a',0);await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId;
 await s.service.payment({invoiceId:id,requestId:'partial-fee',amount:60000,method:'카드',paymentDate:'2026-09-28'},'owner');
 const receipt=structuredClone(s.records.get('opsPayments/partial-fee'));
 const input={studentId:'student-a',planUnits:12,planAmount:210000,phone:'01000001234',phones:['1234']};
 await s.service.configure(input,'owner');
 const invoice=s.records.get(`opsInvoices/${id}`);assert.equal(invoice.paid,60000);assert.equal(invoice.amount,210000);assert.equal(invoice.units,12);
 assert.deepEqual(s.records.get('opsPayments/partial-fee'),receipt);assert.equal(s.records.get('opsAccounts/student-a').remaining,0);
 for(const amount of [60000,50000]){
  const before=structuredClone([...s.records]);await assert.rejects(s.service.configure({...input,planAmount:amount},'owner'),/이미 수납/);assert.deepEqual([...s.records],before);
 }
 await assert.rejects(s.service.payment({invoiceId:id,requestId:'stale-fee',amount:100000,method:'현금'},'owner'),/변경/);
 const payment={invoiceId:id,requestId:'revised-fee',amount:150000,method:'현금',expectedInvoiceUpdatedAt:invoice.updatedAt};
 await Promise.all([s.service.payment(payment,'owner'),s.service.payment(payment,'owner')]);
 assert.equal(s.records.get('opsAccounts/student-a').remaining,12);assert.equal(s.records.get(`opsInvoices/${id}`).status,'paid');
 const paidInvoice=structuredClone(s.records.get(`opsInvoices/${id}`));
 await s.service.configure({...input,planUnits:4,planAmount:150000,syncOpenInvoice:true},'owner');
 assert.deepEqual(s.records.get(`opsInvoices/${id}`),paidInvoice);assert.equal(s.records.get('opsAccounts/student-a').remaining,12);
});
test('current-cycle plan sync never adds already credited lessons again on payment',async()=>{
 const s=setup();await s.seed('student-a',6);await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId;Object.assign(s.records.get(`opsInvoices/${id}`),{creditUnits:0,cycleStart:'2026-09-19'});
 await s.service.configure({studentId:'student-a',planUnits:12,planAmount:210000,phone:'01000001234',phones:['1234']},'owner');
 const invoice=s.records.get(`opsInvoices/${id}`);assert.equal(invoice.creditUnits,0);assert.equal(invoice.units,12);
 await s.service.payment({invoiceId:id,requestId:'current-plan',amount:210000,method:'현금',expectedInvoiceUpdatedAt:invoice.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/student-a').remaining,6);
});
test('plan sync refreshes an unsent billing notice without sending and rejects in-flight notices atomically',async()=>{
 const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');
 const id=s.records.get('opsAccounts/student-a').openInvoiceId,key=`opsNotices/billing_${id}`;
 const input={studentId:'student-a',planUnits:12,planAmount:230000,phone:'01000001234',phones:['1234']};
 s.records.get(`opsInvoices/${id}`).paid=10000;
 for(const [index,status] of ['queued','blocked','review'].entries()){
  s.records.set(key,{status,parameters:{amount:'150000',lesson_count:'8',student_name:'가상 학생'}});
  await s.service.configure({...input,planAmount:230000+index*10000},'owner');
  const notice=s.records.get(key);assert.equal(notice.status,status);assert.equal(notice.parameters.amount,String(220000+index*10000));assert.equal(notice.parameters.lesson_count,'12');assert.equal(notice.parameters.student_name,'가상 학생');
 }
 for(const status of ['processing','submitted','unknown','failed']){
  s.records.get(key).status=status;const before=structuredClone([...s.records]);
  await assert.rejects(s.service.configure({...input,planAmount:260000},'owner'),/발송 결과/);assert.deepEqual([...s.records],before);
 }
 s.records.get(key).status='cancelled';const cancelled=structuredClone(s.records.get(key));
 await s.service.configure({...input,planAmount:260000},'owner');assert.deepEqual(s.records.get(key),cancelled);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsNotices/')).length,1);
});
test('stale plan forms and invalid invoice links reject all changes',async()=>{
 const s=setup();await s.seed();await s.service.createInvoice('student-a','owner');
 const account=s.records.get('opsAccounts/student-a'),id=account.openInvoiceId;
 const input={studentId:'student-a',planUnits:12,planAmount:210000,phone:'01000001234',phones:['1234'],syncOpenInvoice:true,expectedUpdatedAt:account.updatedAt,expectedOpenInvoiceId:id,expectedInvoiceUpdatedAt:''};
 for(const patch of [{expectedUpdatedAt:'old'},{expectedOpenInvoiceId:'other'},{expectedInvoiceUpdatedAt:'old'}]){
  const before=structuredClone([...s.records]);await assert.rejects(s.service.configure({...input,...patch},'owner'),/변경/);assert.deepEqual([...s.records],before);
 }
 const invoice=structuredClone(s.records.get(`opsInvoices/${id}`));
 s.records.get(`opsInvoices/${id}`).studentId='other';
 let before=structuredClone([...s.records]);await assert.rejects(s.service.configure(input,'owner'),/다른 과목/);assert.deepEqual([...s.records],before);
 s.records.delete(`opsInvoices/${id}`);before=structuredClone([...s.records]);await assert.rejects(s.service.configure(input,'owner'),/찾을 수/);assert.deepEqual([...s.records],before);
 s.records.set(`opsInvoices/${id}`,invoice);
 await s.service.configure(input,'owner');
 before=structuredClone([...s.records]);await assert.rejects(s.service.configure({...input,planAmount:220000},'owner'),/변경/);assert.deepEqual([...s.records],before);
});

test('forecast first lessons show payment due before attendance and clear only for full payment of the same course and pass',()=>{
 const s=setup(),{unpaidForecastFirstLessons:due}=s.load('attendance-appearance');
 const forecast=new Map([['person_piano_2026-10-02','1'],['person_piano_2026-10-06','2'],['person_piano_2026-10-30','1'],['person_drums_2026-10-02','1']]);
 const cycles={person_piano:['2026-09-01'],person_drums:['2026-09-01']};
 const before=structuredClone(cycles);
 const invoice={id:'renewal',studentId:'person_piano',units:8,amount:160000,paid:0,status:'open',createdAt:'2026-09-30T02:00:00Z',needsReview:false};
 const all=['person_piano_2026-10-02','person_piano_2026-10-30','person_drums_2026-10-02'];
 assert.deepEqual([...due(forecast,[],cycles)],all); // A billing record need not exist yet.
 assert.deepEqual([...due(forecast,[invoice],cycles)],all);
 assert.deepEqual([...due(forecast,[{...invoice,paid:80000}],cycles)],all);
 const paid={...invoice,paid:160000,status:'paid'};
 assert.deepEqual([...due(forecast,[paid],cycles)],all.slice(1));
 for(const patch of [{status:'cancelled'},{paid:80000},{needsReview:true}])assert.deepEqual([...due(forecast,[{...paid,...patch}],cycles)],all);
 // The previous pass's receipt cannot be assigned to October simply because it is being viewed.
 assert.deepEqual([...due(forecast,[{...paid,createdAt:'2026-08-31T02:00:00Z'}],cycles)],all);
 assert.deepEqual([...due(forecast,[{...paid,lessonDate:'2026-10-30'}],cycles)],[all[0],all[2]]);
 assert.deepEqual([...due(forecast,[paid,{...invoice,id:'extra',lessonDate:'2026-10-02'}],cycles)],all);
 assert.deepEqual(cycles,before);assert.equal(forecast.get('person_piano_2026-10-02'),'1');
});
test('October 2 scheduled first lesson remains only a forecast, then attendance and payment preserve its cycle highlight',()=>{
 const s=setup(),{attendanceForecast:forecast}=s.load('attendance-forecast'),{attendanceSequence:sequence}=s.load('attendance-sequence');
 const {unpaidForecastFirstLessons:due,confirmedFirstLessons:confirmed}=s.load('attendance-appearance');
 const account={id:'p',active:true,planUnits:2,remaining:0,schedule:{rules:[{start:'2026-10-01',weekdays:[5]}],moves:[]}};
 const dates=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
 const context={positions:{p:2},cycleFirstDays:{p:['2026-09-18']},cycleStarts:[]};
 const before=structuredClone(account),records=[];
 let expected=forecast([account],records,[],context,dates,'2026-10-02');
 assert.equal(expected.get('p_2026-10-02'),'1');assert.equal(expected.has('p_2026-10-09'),false);
 assert.deepEqual([...due(expected,[],context.cycleFirstDays)],['p_2026-10-02','p_2026-10-23']);
 const paid={id:'renewal',studentId:'p',amount:160000,paid:160000,status:'paid',createdAt:'2026-09-30T02:00:00Z',needsReview:false};
 assert.deepEqual([...due(expected,[paid],context.cycleFirstDays)],['p_2026-10-23']);
 assert.deepEqual(account,before);assert.equal(records.length,0);
 records.push({studentId:'p',day:'2026-10-02',units:1,status:'present'});
 const actual=sequence([account],records,[],context);
 expected=forecast([account],records,[],context,dates,'2026-10-02');
 assert.equal(actual.labels.get('p_2026-10-02'),'1');assert.equal(expected.has('p_2026-10-02'),false);
 assert.deepEqual([...due(expected,[paid],actual.cycleFirstDays)],['p_2026-10-23']);
 assert.equal(confirmed([paid],actual.cycleFirstDays).has('p_2026-10-02'),true);
});

test('monthly payment priority matches selected-day cells for forecast, paid, imported and cancelled lessons',()=>{
 const s=setup(),{monthlyPaymentDue,unpaidForecastFirstLessons}=s.load('attendance-appearance');
 const key='piano_2026-10-02',day='2026-10-02';
 const base={key,sequence:new Map([[key,'1']]),confirmedFirst:new Set(),cycleFirstDays:{piano:[day]},unpaidCycles:new Set(),unpaidForecastFirst:new Set([key])};
 assert.equal(monthlyPaymentDue(base),true); // Unpaid forecast before checking in.
 assert.equal(monthlyPaymentDue({...base,key:'piano_2026-10-03'}),false);
 assert.equal(monthlyPaymentDue({...base,key:'drum_2026-10-02'}),false); // Same student, different enrollment.
 const invoice={studentId:'piano',cycleStart:day,status:'paid',amount:160000,paid:160000};
 const forecast=new Map([[key,'1']]);
 assert.equal(monthlyPaymentDue({...base,unpaidForecastFirst:unpaidForecastFirstLessons(forecast,[invoice],{})}),false);
 assert.equal(monthlyPaymentDue({...base,unpaidForecastFirst:unpaidForecastFirstLessons(forecast,[{...invoice,status:'open',paid:80000}],{})}),true);
 const row={studentId:'piano',day,status:'present',units:1};
 assert.equal(monthlyPaymentDue({...base,row}),true);
 assert.equal(monthlyPaymentDue({...base,row,confirmedFirst:new Set([key])}),false);
 for(const status of ['cancelled','absent','travel','sick','makeup_reserved']) assert.equal(monthlyPaymentDue({...base,row:{...row,status,units:0}}),false);
 const original={studentId:'piano',day,value:'1',color:''};
 assert.equal(monthlyPaymentDue({...base,original}),true);
 assert.equal(monthlyPaymentDue({...base,original,confirmedFirst:new Set([key])}),false);
 assert.equal(monthlyPaymentDue({...base,original,row:{...row,status:'cancelled',units:0}}),false);
 assert.equal(monthlyPaymentDue({...base,original:{...original,color:'FFCCCCCC'}}),false);
 assert.equal(monthlyPaymentDue({...base,row,sequence:new Map([[key,'3']]),unpaidCycles:new Set([key])}),true);
 assert.equal(monthlyPaymentDue({...base,row,sequence:new Map([[key,'3']]),invoice:{...invoice,status:'open',paid:0}}),true);
 assert.equal(monthlyPaymentDue({...base,invoice:{...invoice,status:'open',paid:0},unpaidForecastFirst:new Set()}),false); // No lesson that day.
});

test('same-day prepayment stays paid before check-in, after arrival, and across a month boundary',()=>{
 const s=setup(),{attendanceForecast:forecast}=s.load('attendance-forecast'),{attendanceSequence:sequence}=s.load('attendance-sequence');
 const {unpaidForecastFirstLessons:due,confirmedFirstLessons:confirmed,monthlyPaymentDue}=s.load('attendance-appearance');
 const {invoiceCycleStart}=s.load('billing-display');
 const account={id:'p',active:true,planUnits:8,remaining:8,schedule:{rules:[{start:'2026-10-02',weekdays:[1,5]}],moves:[]}};
 const context={positions:{p:8},cycleFirstDays:{p:['2026-08-31']},cycleStarts:[]};
 const dates=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
 const invoice={id:'renewal',studentId:'p',units:8,amount:150000,paid:150000,status:'paid',createdAt:'2026-10-02T01:00:00Z',needsReview:false};
 const preview=forecast([account],[],[],context,dates,'2026-10-02');
 assert.equal(preview.get('p_2026-10-02'),'1');
 assert.equal(due(preview,[invoice],context.cycleFirstDays).has('p_2026-10-02'),false);
 for(const patch of [{status:'open',paid:0},{status:'open',paid:50000},{status:'cancelled'},{studentId:'drums'}])assert.equal(due(preview,[{...invoice,...patch}],context.cycleFirstDays).has('p_2026-10-02'),true);
 const row={studentId:'p',day:'2026-10-02',units:1,status:'present',at:'2026-10-02T05:00:00Z'};
 const actual=sequence([account],[row],[],context);
 const paid=confirmed([invoice],actual.cycleFirstDays,actual.firstLessonTimes);
 assert.equal(paid.has('p_2026-10-02'),true);
 assert.equal(monthlyPaymentDue({key:'p_2026-10-02',row,sequence:actual.labels,confirmedFirst:paid,cycleFirstDays:actual.cycleFirstDays,unpaidCycles:new Set(),unpaidForecastFirst:new Set()}),false);
 const next=sequence([account],[],[],{...actual,cycleStarts:[]});
 assert.equal(confirmed([invoice],next.cycleFirstDays,next.firstLessonTimes).has('p_2026-10-02'),true);
 const future=new Map([['p_2026-11-02','1']]);
 assert.equal(due(future,[invoice],next.cycleFirstDays,next.firstLessonTimes).has('p_2026-11-02'),true); // One receipt pays only one pass.
 // An invoice generated after a one-lesson pass (or two-unit final attendance)
 // still belongs to the next pass, even though today's ordinal includes 1.
 const after={...invoice,createdAt:'2026-10-02T06:00:00Z'};
 assert.equal(invoiceCycleStart(after,{p:['2026-10-02','2026-11-02']},actual.firstLessonTimes),'2026-11-02');
 assert.equal(confirmed([after],actual.cycleFirstDays,actual.firstLessonTimes).size,0);
 assert.deepEqual(context,{positions:{p:8},cycleFirstDays:{p:['2026-08-31']},cycleStarts:[]});
});

test('monthly payment sorting returns to today and never silently falls back to the first day',()=>{
 const {attendanceMonthDay}=setup().load('attendance-order');
 const today='2026-10-02';
 assert.equal(attendanceMonthDay(today,-1,today),'2026-09-02');
 assert.equal(attendanceMonthDay('2026-09-02',1,today),today);
 assert.equal(attendanceMonthDay('2026-11-02',-1,today),today);
 assert.equal(attendanceMonthDay('2026-09-30',1,today),today);
 assert.equal(attendanceMonthDay('2026-01-31',1,today),'2026-02-28');
 assert.equal(attendanceMonthDay('2026-12-15',1,today),'2027-01-15');
});

test('lesson times validate, preserve old clients and effective dates, and move with their original lesson',()=>{
 const s=setup(),{changeSchedule,lessonTimeOn}=s.load('schedule');
 const old={rules:[{start:'2026-10-01',weekdays:[1,3],times:{1:{start:'10:00',end:'11:00'},3:{start:'21:15',end:'22:00'}}}],moves:[],updatedAt:'a'};
 const next=changeSchedule(old,{start:'2026-10-12',weekdays:[1,3],times:{1:{start:'14:00',end:'15:30'},3:{start:'21:15',end:'22:00'}},expectedUpdatedAt:'a'},'b','2026-10-03');
 assert.deepEqual(lessonTimeOn(next,'2026-10-07'),{start:'21:15',end:'22:00'});
 assert.deepEqual(lessonTimeOn(next,'2026-10-12'),{start:'14:00',end:'15:30'});
 const moved={...next,moves:[{from:'2026-10-12',to:'2026-10-13'}]};
 assert.equal(lessonTimeOn(moved,'2026-10-12'),undefined);
 assert.deepEqual(lessonTimeOn(moved,'2026-10-13'),{start:'14:00',end:'15:30'});
 const preserved=changeSchedule(next,{start:'2026-10-19',weekdays:[1],expectedUpdatedAt:'b'},'c','2026-10-03');
 assert.deepEqual(preserved.rules.at(-1).times,{1:{start:'14:00',end:'15:30'}});
 for(const time of [{start:'09:59',end:'11:00'},{start:'21:00',end:'22:01'},{start:'14:00',end:'14:00'},{start:'15:00',end:'14:00'},{start:'',end:'11:00'},{start:'14:99',end:'15:00'}])assert.throws(()=>changeSchedule(old,{start:'2026-10-12',weekdays:[1],times:{1:time},expectedUpdatedAt:'a'},'b','2026-10-03'),/시간/);
 const cleared=changeSchedule(old,{start:'2026-10-12',weekdays:[1],times:{1:{start:'',end:''}},expectedUpdatedAt:'a'},'b','2026-10-03');
 assert.equal(lessonTimeOn(cleared,'2026-10-12'),undefined);
 assert.equal(old.rules.length,1);
});
test('weekly timetable includes simultaneous courses, untimed students and course-level leave without mutating records',()=>{
 const {weekDays,timetableLessons,lessonSlot}=setup().load('timetable');
 assert.deepEqual(weekDays('2026-11-01'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
 const days=weekDays('2026-10-14'),schedule={rules:[{start:'2026-10-01',weekdays:[1],times:{1:{start:'14:15',end:'15:00'}}}],moves:[]};
 const data={students:[{id:'p',name:'가나 · 피아노',sourceStudentId:'same'},{id:'d',name:'가나 · 드럼',sourceStudentId:'same',lifecycle:{status:'paused',until:'2026-10-20'}},{id:'v',name:'다라 · 보컬'},{id:'u',name:'마바 · 기타'},{id:'new',name:'신규'}],accounts:[{id:'p',active:true,schedule},{id:'d',active:true,schedule},{id:'v',active:true,schedule},{id:'u',active:true,schedule:{...schedule,rules:[{start:'2026-10-01',weekdays:[1]}]}}]};
 const before=structuredClone(data),result=timetableLessons(data,days);
 assert.deepEqual(result.lessons.map(l=>l.student.id).sort(),['p','u','v']);
 assert.deepEqual(result.unset.map(l=>l.student.id).sort(),['new','u']);
 assert.equal(result.lessons.filter(l=>l.time?.start==='14:15').length,2);
 assert.equal(lessonSlot({start:'14:15',end:'15:00'}),8);
 assert.equal(lessonSlot({start:'21:59',end:'22:00'}),23);
 assert.equal(timetableLessons(data,weekDays('2026-10-21')).lessons.some(l=>l.student.id==='d'),false);
 assert.equal(timetableLessons(data,weekDays('2026-10-26')).lessons.some(l=>l.student.id==='d'),true);
 assert.deepEqual(data,before);
});

test('timetable drag adds ten-minute starts, moves weekly days and preserves sibling weekdays and lesson lengths',()=>{
 const {placeTimetableLesson:place,timetableLessons,weekDays}=setup().load('timetable');
 const old={rules:[{start:'2026-10-01',weekdays:[1,3],times:{1:{start:'11:00',end:'12:00'},3:{start:'14:00',end:'15:00'}}}],moves:[],updatedAt:'a'};
 const moved=place(old,{from:'2026-10-12',to:'2026-10-13',time:'11:40',expectedUpdatedAt:'a'},[],'b','2026-10-03');
 assert.deepEqual(moved.rules.at(-1).weekdays,[2,3]);
 assert.deepEqual(moved.rules.at(-1).times,{2:{start:'11:40',end:'12:40'},3:{start:'14:00',end:'15:00'}});
 assert.deepEqual(old.rules[0].weekdays,[1,3]);
 const added=place(undefined,{to:'2026-10-13',time:'21:50',expectedUpdatedAt:''},[],'a','2026-10-03');
 assert.deepEqual(added.rules[0].times,{2:{start:'21:50',end:''}});
 const retimed=place(added,{from:'2026-10-13',to:'2026-10-13',time:'11:40',expectedUpdatedAt:'a'},[],'b','2026-10-03');
 assert.equal(retimed.rules[0].times[2].start,'11:40');
 const next=timetableLessons({students:[{id:'p',name:'테스트'}],accounts:[{id:'p',active:true,schedule:retimed}]},weekDays('2026-10-20'));
 assert.equal(next.lessons[0].time.start,'11:40');
 for(const patch of [{to:'2026-10-02'},{to:'2026-10-05'},{time:'11:45'},{time:'22:00'},{expectedUpdatedAt:'stale'},{to:'2026-10-14'},{time:'21:50'}])assert.throws(()=>place(old,{from:'2026-10-12',to:'2026-10-13',time:'11:40',expectedUpdatedAt:'a',...patch},[],'b','2026-10-03'));
 assert.throws(()=>place(old,{from:'2026-10-12',to:'2026-10-13',time:'11:40',expectedUpdatedAt:'a'},[{day:'2026-10-12',status:'present',units:1}],'b','2026-10-03'),/출석/);
 const once={...old,moves:[{from:'2026-10-12',to:'2026-10-13'}]};
 const changed=place(once,{from:'2026-10-13',to:'2026-10-15',time:'13:20',expectedUpdatedAt:'a'},[],'b','2026-10-03');
 assert.deepEqual(changed.rules,once.rules);
 assert.deepEqual(changed.moves,[{from:'2026-10-12',to:'2026-10-15',time:{start:'13:20',end:'14:20'}}]);
 const {lessonTimeOn}=setup().load('schedule');
 assert.deepEqual(lessonTimeOn(changed,'2026-10-15'),{start:'13:20',end:'14:20'});
});

test('timetable excludes withdrawn courses and includes a paused course only after its end date',()=>{
 const {timetableLessons,weekDays}=setup().load('timetable');
 const schedule={rules:[{start:'2026-10-01',weekdays:[1,2,3,4,5],times:{1:{start:'10:00',end:''}}}],moves:[]};
 const data={students:[{id:'p',sourceStudentId:'same',name:'테스트 피아노'},{id:'d',sourceStudentId:'same',name:'테스트 드럼',lifecycle:{status:'withdrawn'}},{id:'v',name:'휴원',lifecycle:{status:'paused',until:'2026-10-14'}}],accounts:['p','d','v'].map(id=>({id,active:true,schedule}))};
 const result=timetableLessons(data,weekDays('2026-10-14'));
 assert.equal(result.lessons.some(l=>l.student.id==='d'),false);
 assert.equal(result.unset.some(l=>l.student.id==='d'),false);
 assert.equal(result.lessons.filter(l=>l.student.id==='p').length,5);
 assert.deepEqual(result.lessons.filter(l=>l.student.id==='v').map(l=>l.day),['2026-10-15','2026-10-16']);
});

test('timetable placements persist atomically without changing balances and reject stale or inactive courses',async()=>{
 const s=setup();await s.seed('piano',7);await s.seed('drum',3);
 const day=s.load('model').seoulDay(),accountBefore=structuredClone(s.records.get('opsAccounts/piano'));
 const input={action:'placeTimetableLesson',studentId:'piano',to:day,time:'11:40',expectedUpdatedAt:''};
 const changes=await s.service.saveSchedule(input,'owner');
 assert.equal(changes.accounts[0].schedule.rules[0].times[new Date(day+'T00:00:00Z').getUTCDay()].start,'11:40');
 const accountAfter={...s.records.get('opsAccounts/piano')};delete accountAfter.schedule;
 assert.deepEqual(accountAfter,accountBefore);
 assert.equal(s.records.get('opsAccounts/drum').remaining,3);
 assert.equal([...s.records.keys()].some(k=>/^ops(Attendance|Invoices|Notices)\//.test(k)),false);
 await assert.rejects(s.service.saveSchedule(input,'owner'),/변경/);
 const expectedUpdatedAt=s.records.get('opsAccounts/piano').schedule.updatedAt;
 s.records.get('students/piano').courseLifecycles={piano:{status:'withdrawn'}};
 await assert.rejects(s.service.saveSchedule({...input,time:'12:00',expectedUpdatedAt},'owner'),/휴원·퇴원/);
});


test('building a weekly timetable in reverse weekday order preserves all placements',()=>{
 const {placeTimetableLesson:place}=setup().load('timetable');
 let schedule;
 for(const [to,time,stamp] of [['2026-10-16','14:00','a'],['2026-10-13','11:40','b'],['2026-10-12','10:20','c']])schedule=place(schedule,{to,time,expectedUpdatedAt:schedule?.updatedAt||''},[],stamp,'2026-10-03');
 assert.equal(schedule.rules.length,1);assert.equal(schedule.rules[0].start,'2026-10-12');
 assert.deepEqual(schedule.rules[0].weekdays,[1,2,5]);
 assert.equal(schedule.rules[0].times[5].start,'14:00');
 assert.equal(schedule.rules[0].times[2].start,'11:40');
});

test('weekday board shows recurring days without calendar dates, closures or one-off moves',()=>{
 const s=setup(),{regularTimetableLessons:list}=s.load('timetable');
 const schedule={rules:[{start:'2026-10-01',weekdays:[1,5],times:{1:{start:'11:40',end:''},5:{start:'14:00',end:''}}}],moves:[{from:'2026-10-02',to:'2026-10-03'}]};
 const data={students:[{id:'p',name:'피아노'},{id:'d',name:'드럼',lifecycle:{status:'paused',until:'2026-10-06'}},{id:'v',name:'보컬',lifecycle:{status:'withdrawn'}}],accounts:['p','d','v'].map(id=>({id,active:true,schedule}))};
 const rows=list(data,'2026-10-05');
 assert.deepEqual(rows.lessons.map(l=>[l.student.id,l.weekday]),[['p',1],['p',5]]);
 assert.equal(rows.lessons[0].time.start,'11:40');
 assert.equal(list(data,'2026-10-07').lessons.some(l=>l.student.id==='d'),true);
});
test('weekday placement works for Monday on Saturday, preserves Sunday and history, and ignores dated attendance',()=>{
 const {placeRegularTimetableLesson:place,regularTimetableLessons:list}=setup().load('timetable');
 const old={rules:[{start:'2026-10-01',weekdays:[0,6],times:{0:{start:'11:00',end:'12:00'},6:{start:'14:00',end:''}}}],moves:[{from:'2026-10-04',to:'2026-10-06'}],updatedAt:'a'};
 const added=place(old,{weekday:1,time:'11:40',expectedUpdatedAt:'a'},'b','2026-10-03');
 assert.deepEqual(added.rules.at(-1).weekdays,[1,6,0]);assert.equal(added.rules.at(-1).start,'2026-10-03');assert.deepEqual(added.moves,old.moves);assert.deepEqual(added.rules[0],old.rules[0]);
 const moved=place(added,{fromWeekday:0,weekday:2,time:'10:20',expectedUpdatedAt:'b'},'c','2026-10-03');
 assert.deepEqual(moved.rules.at(-1).weekdays,[1,2,6]);assert.deepEqual(moved.rules.at(-1).times[2],{start:'10:20',end:'11:20'});
 assert.throws(()=>place(moved,{fromWeekday:2,weekday:1,time:'10:20',expectedUpdatedAt:'c'},'d','2026-10-03'),/이미/);
 assert.throws(()=>place(moved,{weekday:7,time:'10:20',expectedUpdatedAt:'c'},'d','2026-10-03'),/요일/);
 const future={rules:[{start:'2026-10-12',weekdays:[1],times:{1:{start:'11:00',end:''}}}],moves:[],updatedAt:'a'};
 const updated=place(future,{weekday:2,time:'11:40',expectedUpdatedAt:'a'},'b','2026-10-03');
 assert.equal(updated.rules.length,1);assert.equal(updated.rules[0].start,'2026-10-12');
 assert.deepEqual(list({students:[{id:'p',name:'피아노'}],accounts:[{id:'p',active:true,schedule:updated}]},'2026-10-03').lessons.map(l=>l.weekday),[1,2]);
});
test('regular timetable saves only schedule and excludes a withdrawn course in the server',async()=>{
 const s=setup();await s.seed('piano',7);const before=structuredClone(s.records.get('opsAccounts/piano'));
 const input={action:'placeRegularTimetableLesson',studentId:'piano',weekday:1,time:'11:40',expectedUpdatedAt:''};
 const changes=await s.service.saveSchedule(input,'owner');assert.equal(changes.accounts[0].schedule.rules[0].times[1].start,'11:40');
 const after={...s.records.get('opsAccounts/piano')};delete after.schedule;assert.deepEqual(after,before);
 assert.equal([...s.records.keys()].some(k=>/^ops(Attendance|Invoices|Notices)\//.test(k)),false);
 s.records.get('students/piano').courseLifecycles={piano:{status:'withdrawn'}};
 await assert.rejects(s.service.saveSchedule({...input,expectedUpdatedAt:changes.accounts[0].schedule.updatedAt},'owner'),/휴원·퇴원/);
});

test('a 12-lesson September pass resets to a 16-lesson pass on October 2 without relabeling the previous final lesson',()=>{
 const s=setup(),{attendanceSequence:sequence}=s.load('attendance-sequence'),{passCycleStarts}=s.load('pass-history');
 const accounts=[{id:'p',planUnits:16,passHistory:[{start:'2026-09-01',units:12},{start:'2026-10-02',units:16}]}];
 const legacy=[{studentId:'p',day:'2026-09-01',value:'1',color:''},{studentId:'p',day:'2026-09-22',value:'10',color:''}];
 const row=day=>({studentId:'p',day,units:1,status:'present',at:day+'T06:00:00Z'}),records=['2026-09-30','2026-10-01','2026-10-02','2026-10-03'].map(row);
 const result=sequence(accounts,records,legacy);
 assert.equal(result.labels.get('p_2026-09-30'),'11');assert.equal(result.labels.get('p_2026-10-01'),'12');assert.equal(result.labels.get('p_2026-10-02'),'1');assert.equal(result.labels.get('p_2026-10-03'),'2');
 const starts=passCycleStarts(accounts),prior=sequence(accounts,[row('2026-09-30')],legacy,{positions:{},cycleStarts:starts.filter(r=>r.day<'2026-10-01')});
 const current=sequence(accounts,records.filter(r=>r.day>='2026-10-01'),[],{...prior,cycleStarts:starts.filter(r=>r.day>='2026-10-01')});
 assert.deepEqual([...current.labels],[...result.labels].filter(([key])=>key>='p_2026-10-01'));
 const {invoiceCycleStart}=s.load('billing-display');
 assert.equal(invoiceCycleStart({id:'paid',studentId:'p',status:'paid',createdAt:'2026-10-01T08:58:36Z'},current.cycleFirstDays,current.firstLessonTimes),'2026-10-02');
 assert.equal(sequence(accounts,[row('2026-09-30')],legacy).positions.p,11);
});
test('pass history correction preserves remaining, payments and configuration while auditing the change',async()=>{
 const s=setup();await s.seed('p',14);s.records.get('opsAccounts/p').planUnits=16;
 const before=structuredClone(s.records.get('opsAccounts/p'));
 const history=[{start:'2026-09-01',units:12},{start:'2026-10-02',units:16}];
 await s.service.savePassHistory({studentId:'p',history,expectedUpdatedAt:before.updatedAt},'owner');
 const after=s.records.get('opsAccounts/p');assert.deepEqual(after.passHistory,history);assert.equal(after.remaining,14);assert.equal(after.planUnits,16);assert.equal(after.planAmount,before.planAmount);
 assert.equal([...s.records.keys()].some(k=>/^ops(Attendance|Invoices|Payments|Notices)\//.test(k)),false);
 await assert.rejects(s.service.savePassHistory({studentId:'p',history,expectedUpdatedAt:before.updatedAt},'owner'),/변경/);
 await s.service.configure({studentId:'p',planUnits:16,planAmount:250000,phone:'01000001234',phones:['1234'],active:true},'owner');
 assert.deepEqual(s.records.get('opsAccounts/p').passHistory,history);
 const {passHistoryInput}=s.load('pass-history');
 for(const history of [[],[{start:'bad',units:16}],[{start:'2999-01-01',units:16}],[{start:'2026-10-02',units:12}],[{start:'2026-10-02',units:16},{start:'2026-10-02',units:16}]])assert.throws(()=>passHistoryInput(history,16,'2026-10-06'));
});

test('next pass reservation leaves current and other courses intact and creates an approval-only separate invoice',async()=>{
 const s=setup();await s.seed('piano',3);await s.seed('drum',4);
 await s.service.createCurrentCycleInvoice({studentId:'piano',cycleStart:'2026-09-01',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt},'owner');
 const before=structuredClone(s.records.get('opsAccounts/piano')),drum=structuredClone(s.records.get('opsAccounts/drum'));
 await s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:before.updatedAt,units:16,amount:250000,mode:'depleted'},'owner');
 const a=s.records.get('opsAccounts/piano'),i=s.records.get(`opsInvoices/${a.nextPass.invoiceId}`);
 assert.equal(a.planUnits,8);assert.equal(a.planAmount,160000);assert.equal(a.remaining,3);assert.equal(a.openInvoiceId,before.openInvoiceId);
 assert.equal(i.units,16);assert.equal(i.amount,250000);assert.equal(i.creditUnits,0);assert.equal(i.reservedPass,true);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,2);
 assert.deepEqual(s.records.get('opsAccounts/drum'),drum);assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
 assert.equal(s.load('billing-display').invoiceCycleStart(i,{piano:['2999-01-01']}),undefined);
 await assert.rejects(s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:before.updatedAt,units:12,amount:210000,mode:'depleted'},'owner'),/변경/);
});
test('prepaid reserved pass activates once on kiosk arrival with new sequence and no second credit at payment',async()=>{
 const s=setup();await s.seed('piano',0);const today=s.load('model').seoulDay();
 await s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt,units:16,amount:250000,mode:'depleted'},'owner');
 const invoiceId=s.records.get('opsAccounts/piano').nextPass.invoiceId,i=s.records.get(`opsInvoices/${invoiceId}`);
 await s.service.payment({invoiceId,requestId:'prepaid',amount:250000,method:'카드',expectedInvoiceUpdatedAt:i.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,0);
 const results=await Promise.all([s.service.checkIn('piano','1234','device'),s.service.checkIn('piano','1234','device')]);
 assert.equal(results.filter(r=>r.duplicate).length,1);
 const a=s.records.get('opsAccounts/piano');assert.equal(a.remaining,15);assert.equal(a.planUnits,16);assert.equal(a.planAmount,250000);assert.equal(a.nextPass,null);assert.equal(a.openInvoiceId,null);
 assert.equal(s.records.get(`opsInvoices/${invoiceId}`).cycleStart,today);
 const record=s.records.get(`opsAttendance/piano_${today}`),seq=s.load('attendance-sequence').attendanceSequence([a],[record],[]);
 assert.equal(seq.labels.get(`piano_${today}`),'1');
 await s.service.recordAttendance({studentId:'piano',day:today,status:'cancelled',units:0,expectedUpdatedAt:record.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,16);
 await s.service.checkIn('piano','1234','device');assert.equal(s.records.get('opsAccounts/piano').remaining,15);
 assert.equal([...s.records.values()].filter(r=>r.action==='activate-next-pass').length,1);
});
test('dated unpaid pass carries unused lessons, preserves the old debt and late payment cannot double credit',async()=>{
 const s=setup();await s.seed('piano',3);const today=s.load('model').seoulDay();
 await s.service.createCurrentCycleInvoice({studentId:'piano',cycleStart:'2026-09-01',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt},'owner');const oldId=s.records.get('opsAccounts/piano').openInvoiceId;
 await s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt,units:12,amount:210000,mode:'date',start:today},'owner');
 const id=s.records.get('opsAccounts/piano').nextPass.invoiceId;
 await s.service.recordAttendance({studentId:'piano',day:today,status:'travel',units:0},'owner');
 assert.ok(s.records.get('opsAccounts/piano').nextPass);assert.equal(s.records.get('opsAccounts/piano').remaining,3);
 let r=s.records.get(`opsAttendance/piano_${today}`);
 await s.service.recordAttendance({studentId:'piano',day:today,status:'present',units:1,expectedUpdatedAt:r.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,14);assert.equal(s.records.get(`opsInvoices/${oldId}`).status,'open');
 const i=s.records.get(`opsInvoices/${id}`);
 await s.service.payment({invoiceId:id,requestId:'late-pay',amount:210000,method:'현금',expectedInvoiceUpdatedAt:i.updatedAt},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,14);
 r=s.records.get(`opsAttendance/piano_${today}`);
 await s.service.recordAttendance({studentId:'piano',day:today,status:'present',units:1,expectedUpdatedAt:r.updatedAt},'owner');assert.equal(s.records.get('opsAccounts/piano').remaining,14);
 const account=s.records.get('opsAccounts/piano'),audit=[...s.records.entries()].filter(([k])=>k.startsWith('opsAudit/')).map(([id,row])=>({id,...row})),invoices=[...s.records.entries()].filter(([k])=>k.startsWith('opsInvoices/')).map(([,row])=>row);
 const report=s.load('balance-review').reviewBalance(account,undefined,audit,[r],invoices);assert.equal(report.ledger,14);
});
test('a reservation can be edited/cancelled atomically, but receipts and reserved invoice edits are protected',async()=>{
 const s=setup();await s.seed('piano',2);const input={studentId:'piano',units:12,amount:210000,mode:'depleted'};
 const save=extra=>s.service.saveNextPass({...input,expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt,...extra},'owner');
 await save({});const id=s.records.get('opsAccounts/piano').nextPass.invoiceId;
 await save({units:16,amount:250000});assert.equal(s.records.get('opsAccounts/piano').nextPass.invoiceId,id);assert.equal(s.records.get(`opsInvoices/${id}`).amount,250000);
 await assert.rejects(s.service.invoiceAction({invoiceId:id,action:'cancelInvoice'},'owner'),/예약/);
 await save({cancel:true});assert.equal(s.records.get(`opsInvoices/${id}`).status,'cancelled');assert.equal(s.records.get('opsAccounts/piano').remaining,2);
 await save({});const nextId=s.records.get('opsAccounts/piano').nextPass.invoiceId,i=s.records.get(`opsInvoices/${nextId}`);
 await s.service.payment({invoiceId:nextId,requestId:'partial',amount:10000,method:'현금',expectedInvoiceUpdatedAt:i.updatedAt},'owner');
 await assert.rejects(save({cancel:true}),/수납/);
 const {nextPassInput}=s.load('next-pass');for(const v of [{units:0},{amount:0},{mode:'bad'},{mode:'date',start:'2000-01-01'}])assert.throws(()=>nextPassInput({...input,...v},'test'));
});
test('depletion does not start early or duplicate reserved invoice and past lessons retain old pass units',async()=>{
 const s=setup();await s.seed('piano',1);const today=s.load('model').seoulDay(),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 await s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt,units:16,amount:250000,mode:'depleted'},'owner');
 s.records.get('opsAccounts/piano').nextPass.reservedOn=yesterday;
 await s.service.recordAttendance({studentId:'piano',day:yesterday,status:'present',units:1},'owner');
 assert.equal(s.records.get('opsAccounts/piano').remaining,0);assert.equal(s.records.get('opsAccounts/piano').planUnits,8);assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 await s.service.checkIn('piano','1234','device');const account=s.records.get('opsAccounts/piano');assert.equal(account.remaining,15);
 assert.equal(s.load('pass-history').passUnitsOn(account,yesterday),8);assert.equal(s.load('pass-history').passUnitsOn(account,today),16);
});

test('a future dated reservation does not activate on an earlier arrival or a makeup lesson',async()=>{
 const s=setup();await s.seed('piano',0);const today=s.load('model').seoulDay();
 await s.service.saveNextPass({studentId:'piano',expectedUpdatedAt:s.records.get('opsAccounts/piano').updatedAt,units:12,amount:210000,mode:'date',start:'2999-01-01'},'owner');
 const id=s.records.get('opsAccounts/piano').nextPass.invoiceId;
 await s.service.checkIn('piano','1234','device');assert.equal(s.records.get('opsAccounts/piano').remaining,-1);assert.equal(s.records.get('opsAccounts/piano').planUnits,8);assert.ok(s.records.get('opsAccounts/piano').nextPass);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
 const a=s.records.get('opsAccounts/piano');assert.equal(s.load('next-pass').nextPassDue({...a,nextPass:{...a.nextPass,start:today}},today,'makeup'),false);
 await assert.rejects(s.service.linkInvoiceLesson({invoiceId:id,lessonDate:today,expectedUpdatedAt:s.records.get(`opsInvoices/${id}`).updatedAt},'owner'),/예약/);
});

test('travel preserves makeup credit while next ordinal 1 appears in upcoming billing, using monthly calendar rules',()=>{
 const s=setup(),{billingProjection}=s.load('upcoming-billing');
 const account={id:'p',name:'방진서',active:true,remaining:1,planUnits:12,planAmount:180000,schedule:{rules:[{start:'2026-10-01',weekdays:[3,5,6]}],moves:[]}};
 const data={day:'2026-10-06',accounts:[account],students:[{id:'p'}],invoices:[],settledInvoices:[],legacyAttendance:[{studentId:'p',day:'2026-10-02',value:'11',color:''}],attendance:[{studentId:'p',day:'2026-10-03',status:'travel',units:0}],sequenceContext:{positions:{},cycleStarts:[]}};
 const before=structuredClone(data),rows=billingProjection(data,'2026-10-06').upcoming;
 assert.equal(rows.length,1);assert.equal(rows[0].lessonDate,'2026-10-07');assert.equal(rows[0].amount,180000);assert.equal(rows[0].units,12);assert.equal(rows[0].projected,true);assert.deepEqual(data,before);
 for(const status of ['open','paid']){const invoice={...rows[0],projected:undefined,status,paid:status==='paid'?180000:0};assert.equal(billingProjection({...data,invoices:status==='open'?[invoice]:[],settledInvoices:status==='paid'?[invoice]:[]},'2026-10-06').upcoming.length,0);}
 assert.equal(billingProjection({...data,cancelledInvoiceKeys:['p_2026-10-07']},'2026-10-06').upcoming.some(i=>i.lessonDate==='2026-10-07'),false);
 for(const status of ['paused','withdrawn'])assert.equal(billingProjection({...data,students:[{id:'p',lifecycle:{status}}]},'2026-10-06').upcoming.length,0);
 account.schedule.moves=[{from:'2026-10-07',to:'2026-10-08'}];assert.equal(billingProjection(data,'2026-10-06').upcoming[0].lessonDate,'2026-10-08');
 account.nextPass={invoiceId:'reserved'};assert.equal(billingProjection(data,'2026-10-06').upcoming.length,0);
});
test('billing uses next-month leave records and an unpaid actual first lesson remains visible after arrival',()=>{
 const s=setup(),{billingProjection}=s.load('upcoming-billing');
 const data={day:'2026-10-30',accounts:[{id:'p',name:'p',active:true,remaining:1,planUnits:4,planAmount:100000,schedule:{rules:[{start:'2026-10-01',weekdays:[1]}],moves:[]}}],students:[{id:'p'}],invoices:[],settledInvoices:[],legacyAttendance:[{studentId:'p',day:'2026-10-26',value:'3',color:''}],attendance:[],forecastAttendance:[{studentId:'p',day:'2026-11-02',status:'travel',units:0}]};
 assert.equal(billingProjection(data,'2026-10-30').upcoming[0].lessonDate,'2026-11-09');
 const actual={...data,day:'2026-10-06',legacyAttendance:[],forecastAttendance:[],attendance:[{studentId:'p',day:'2026-10-05',status:'present',units:1}]};
 assert.equal(billingProjection(actual,'2026-10-06').upcoming[0].lessonDate,'2026-10-05');
});
test('confirming a projected first lesson is idempotent, dated, course scoped and never sends a message or changes the balance',async()=>{
 const s=setup();await s.seed('p',1);await s.seed('d',3);const today=s.load('model').seoulDay(),tomorrow=new Date(Date.parse(today)+86400000).toISOString().slice(0,10),weekday=new Date(tomorrow).getUTCDay();
 s.records.get('opsAccounts/p').schedule={rules:[{start:today,weekdays:[weekday]}],moves:[],updatedAt:'schedule-v1'};
 const a=structuredClone(s.records.get('opsAccounts/p')),input={studentId:'p',lessonDate:tomorrow,expectedUpdatedAt:a.updatedAt,expectedScheduleUpdatedAt:'schedule-v1'};
 const rows=await Promise.all([s.service.prepareUpcomingInvoice(input,'owner'),s.service.prepareUpcomingInvoice(input,'owner')]);assert.equal(rows[0].id,rows[1].id);assert.equal(rows[0].lessonDate,tomorrow);assert.equal(rows[0].amount,160000);
 assert.equal(s.records.get('opsAccounts/p').remaining,1);assert.equal(s.records.get('opsAccounts/d').remaining,3);assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);assert.equal([...s.records.keys()].some(k=>k.startsWith('opsNotices/')),false);
 await s.service.payment({invoiceId:rows[0].id,requestId:'advance-1',amount:160000,method:'현금'},'owner');assert.equal(s.records.get('opsAccounts/p').remaining,9);
 assert.equal((await s.service.prepareUpcomingInvoice(input,'owner')).status,'paid');
});

test('monthly payment records an old first lesson without crediting the already imported balance or changing attendance',async()=>{
 const s=setup();await s.seed('p',5);await s.seed('drum',2);const day='2026-09-01',a=s.records.get('opsAccounts/p');
 const input={studentId:'p',lessonDate:day,requestId:'monthly-pay-1',expectedUpdatedAt:a.updatedAt,amount:160000,invoiceAmount:160000,addUnits:false,method:'카드',paymentDate:'2026-09-05'};
 await Promise.all([s.service.monthlyPayment(input,'owner'),s.service.monthlyPayment(input,'owner')]);
 assert.equal(s.records.get('opsAccounts/p').remaining,5);assert.equal(s.records.get('opsAccounts/drum').remaining,2);
 const invoices=[...s.records.values()].filter(i=>i.studentId==='p'&&i.status==='paid');assert.equal(invoices.length,1);assert.equal(invoices[0].lessonDate,day);assert.equal(invoices[0].creditUnits,0);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsPayments/')).length,1);assert.equal([...s.records.keys()].some(k=>k.startsWith('opsAttendance/')||k.startsWith('opsNotices/')),false);
 assert.ok(s.load('attendance-appearance').confirmedFirstLessons(invoices,{p:[day]}).has(`p_${day}`));
 await assert.rejects(s.service.monthlyPayment({...input,amount:150000},'owner'),/중복/);
});
test('monthly payment reuses the selected cycle, supports partial payment, and credits a new pass only once on full settlement',async()=>{
 const s=setup();await s.seed('p',1);await s.service.createInvoice('p','owner');const id=s.records.get('opsAccounts/p').openInvoiceId,day='2026-10-07';
 const input={studentId:'p',invoiceId:id,lessonDate:day,requestId:'part-one',expectedUpdatedAt:s.records.get('opsAccounts/p').updatedAt,expectedInvoiceUpdatedAt:'',amount:60000,method:'현금'};
 await s.service.monthlyPayment(input,'owner');assert.equal(s.records.get('opsInvoices/'+id).status,'open');assert.equal(s.records.get('opsAccounts/p').remaining,1);
 const last={...input,requestId:'part-two',amount:100000,expectedUpdatedAt:s.records.get('opsAccounts/p').updatedAt,expectedInvoiceUpdatedAt:s.records.get('opsInvoices/'+id).updatedAt};
 await s.service.monthlyPayment(last,'owner');await s.service.monthlyPayment(last,'owner');assert.equal(s.records.get('opsInvoices/'+id).status,'paid');assert.equal(s.records.get('opsAccounts/p').remaining,9);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsInvoices/')).length,1);
});
test('linking an existing paid receipt to a monthly first lesson does not record another payment or add units',async()=>{
 const s=setup();await s.seed('p',1);await s.service.createInvoice('p','owner');const id=s.records.get('opsAccounts/p').openInvoiceId;
 await s.service.payment({invoiceId:id,requestId:'already-paid',amount:160000,method:'현금'},'owner');
 const before=s.records.get('opsAccounts/p').remaining,input={studentId:'p',invoiceId:id,lessonDate:'2026-09-10',requestId:'link-receipt',linkOnly:true,expectedInvoiceUpdatedAt:''};
 await s.service.monthlyPayment(input,'owner');await s.service.monthlyPayment(input,'owner');assert.equal(s.records.get('opsInvoices/'+id).lessonDate,'2026-09-10');assert.equal(s.records.get('opsAccounts/p').remaining,before);assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsPayments/')).length,1);
 await assert.rejects(s.service.monthlyPayment({...input,lessonDate:'2026-09-11'},'owner'),/다른 수강권/);
});
test('monthly payment rejects another course, conflicting cycle, stale balance, and future receipt dates',async()=>{
 const s=setup();await s.seed('p',1);await s.seed('d',3);await s.service.createInvoice('d','owner');const foreign=s.records.get('opsAccounts/d').openInvoiceId;
 const base={studentId:'p',lessonDate:'2026-09-01',requestId:'validation',expectedUpdatedAt:s.records.get('opsAccounts/p').updatedAt,amount:160000,invoiceAmount:160000,addUnits:false,method:'현금'};
 await assert.rejects(s.service.monthlyPayment({...base,invoiceId:foreign},'owner'),/다른 과목/);
 await assert.rejects(s.service.monthlyPayment({...base,expectedUpdatedAt:'stale'},'owner'),/변경/);
 await assert.rejects(s.service.monthlyPayment({...base,paymentDate:'2999-01-01'},'owner'),/결제받은 날짜/);
 await s.service.monthlyPayment(base,'owner');
 await assert.rejects(s.service.monthlyPayment({...base,requestId:'second'},'owner'),/변경/);
 assert.equal([...s.records.keys()].filter(k=>k.startsWith('opsPayments/')).length,1);
});


test('monthly receipts group transfers with cash without losing records or double-counting totals',()=>{
 const {monthlyPayments,receiptMethodGroup}=setup().load('payment-month');
 const methods=['현금','계좌이체','지역화폐','카드'];
 const rows=methods.map((method,index)=>({id:String(index),method,amount:(index+1)*10000,paymentDate:'2026-10-07',at:'2026-10-07T01:00:00.000Z'}));
 const result=monthlyPayments([...rows,{...rows[0],id:'previous',paymentDate:'2026-09-30'}],'2026-10');
 assert.deepEqual(result.methods.map(m=>m.method),['현금','지역화폐','카드']);
 assert.deepEqual(result.methods[0],{method:'현금',count:2,amount:30000});
 assert.equal(result.total,100000);assert.equal(result.rows.length,4);
 assert.equal(result.methods.reduce((sum,m)=>sum+m.amount,0),result.total);
 assert.equal(result.rows.filter(p=>receiptMethodGroup(p.method)==='현금').length,2);
 assert.equal(rows[1].method,'계좌이체');
});
