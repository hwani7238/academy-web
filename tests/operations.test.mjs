import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve('src/lib/operations');
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
test('monthly roster sorts all rows by Korean name or selected-day arrivals without merging courses',()=>{
 const s=setup(),{arrivalsOnDay,orderAttendanceStudents}=s.load('attendance-order');
 const students=Array.from({length:195},(_,i)=>({id:`s${i}`,name:`학생${i}`,phone:''}));
 students[0].name='홍길동 · 피아노';students[1].name='강하늘 · 보컬';students[2].name='김가람 · 드럼';students[3].name='김가람 · 피아노';
 const day='2026-09-29';
 const record=(id,status,at,source='kiosk')=>({studentId:id,day,status,at,source});
 const arrivals=arrivalsOnDay({attendance:[record('s0','present','2026-09-29T05:00:00Z'),record('s2','makeup','2026-09-29T04:00:00Z'),record('s3','cancelled','2026-09-29T03:00:00Z'),record('s4','absent','2026-09-29T02:00:00Z'),record('s5','present','2026-09-29T01:00:00Z','manual'),{...record('s6','present','2026-09-28T01:00:00Z'),day:'2026-09-28'}],legacyAttendance:[{studentId:'s3',day,value:'3',color:''},{studentId:'s7',day,value:'2',color:'FFCCCCCC'},{studentId:'s8',day,value:'2',color:'FFFF00FF'},{studentId:'s9',day,value:'병가',color:''}]},day);
 assert.deepEqual([...arrivals.keys()],['s0','s2','s5','s8']);
 assert.equal(arrivals.get('s5').time,undefined);
 const ordered=orderAttendanceStudents(students,'attendance',arrivals);
 assert.equal(ordered.length,195);assert.deepEqual(ordered.slice(0,4).map(s=>s.id),['s2','s0','s5','s8']);
 assert.equal(orderAttendanceStudents(students,'name',arrivals)[0].id,'s1');
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
 s.records.set('opsImports/source',{subject:'어린이 피아노',asOf:'2026-09-23',history:[{section:'피아노(어린이)2관',cells:[{day:'2026-09-01'}]}]});
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
test('new registration atomically creates a compatible student and check-in account, with retry safety',async()=>{
 const s=setup();const input={requestId:'request-new',name:'신규 학생',phone:'010-0000-1234',personalPhone:'010-0000-5678',group:'어린이 피아노(2관)',planUnits:8,planAmount:170000,remaining:8};
 const results=await Promise.all([s.service.registerStudent(input,'owner'),s.service.registerStudent(input,'owner')]);
 assert.equal(results.filter(r=>r.duplicate).length,1);
 const students=[...s.records].filter(([k])=>k.startsWith('students/'));assert.equal(students.length,1);
 assert.equal(students[0][1].status,'등록');assert.equal(students[0][1].phoneLast4,'1234');
 const a=s.records.get(`opsAccounts/${results[0].studentId}`);assert.equal(a.attendanceGroup,'어린이 피아노(2관)');assert.equal(a.remaining,8);assert.deepEqual(a.checkinSuffixes,['1234','5678']);
 assert.equal([...s.records.keys()].some(k=>k.startsWith('opsInvoices/')||k.startsWith('opsPayments/')||k.startsWith('opsNotices/')),false);
 await assert.rejects(s.service.registerStudent({...input,requestId:'other'},'owner'));
 await assert.rejects(s.service.registerStudent({...input,planAmount:190000},'owner'));
 await s.service.checkIn(a.id,'5678','device');assert.equal(s.records.get(`opsAccounts/${a.id}`).remaining,7);
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
          get: async r => { assert.equal(written, false, 'Firestore forbids reads after writes'); return snap(r.path); },
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
  return { records, service, load, seed, importPost:body=>routeExports.POST(new Request('https://test/api/operations/import',{method:'POST',body:JSON.stringify(body)})) };
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
test('changing plan does not reset balance or alter existing invoice price', async () => {
  const s=setup();await s.seed();await s.service.createInvoice('student-a','owner'); const invoiceId=s.records.get('opsAccounts/student-a').openInvoiceId;
  await s.service.configure({studentId:'student-a',planUnits:12,planAmount:210000,remaining:99,phone:'01000005678',phones:['5678']},'owner');
  assert.equal(s.records.get('opsAccounts/student-a').remaining,1);assert.equal(s.records.get(`opsInvoices/${invoiceId}`).amount,160000);
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
test('invalid, future and nonzero cancelled attendance is rejected', async()=>{
 const s=setup();await s.seed();const input={studentId:'student-a',day:'2026-02-30',status:'absent',units:0,note:'test'};
 for(const patch of [{},{day:'2999-01-01'},{day:s.load('model').seoulDay(),status:'cancelled',units:1},{day:s.load('model').seoulDay(),status:'invalid'}]) await assert.rejects(s.service.recordAttendance({...input,...patch},'owner'));
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
