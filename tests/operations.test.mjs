import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = path.resolve('src/lib/operations');
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
  return { records, service, load, seed };
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
