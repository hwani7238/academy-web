import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

function load(file, dependency) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => typeof dependency === 'function' ? dependency(name) : dependency, exports);
  return exports;
}
test('combined endpoint authorizes first; unchanged revision skips all ledger queries; full refresh reads a pre-snapshot revision', async () => {
  let authorized = false, revisionStamp = 'one', scheduleStamp = 'schedule-one', invoiceStamp = 'invoice-one'; const reads = [];
  const query = name => ({
    orderBy(field){this.field=field;return this;},limit(){return this;},select(){return this;},where(){return this;},
    async get(){reads.push(name);return {docs:name==='opsInvoices'?[{id:'invoice',data:()=>({updatedAt:invoiceStamp}),updateTime:invoiceStamp}]:name==='opsAttendance'&&this.field==='updatedAt'?[{id:'private-id',data:()=>({updatedAt:'time'}),updateTime:revisionStamp}]:name==='opsAccounts'&&this.field==='schedule.updatedAt'?[{id:'private-course',data:()=>({schedule:{updatedAt:scheduleStamp}}),updateTime:scheduleStamp}]:[]};},
  });
  const hash = value => createHash('sha256').update(value).digest('hex');
  const timing = {measure:async(_name,work)=>work(),header:()=>''};
  const {GET} = load('src/app/api/operations/route.ts', name => {
    if(name.endsWith('/auth')) return {manager:async()=>{if(!authorized)throw Error('unauthorized');},database:()=>({collection:query}),hash,failure:e=>{if(authorized)throw e;return Response.json({}, {status:401})}};
    if(name.endsWith('/revision')) return load('src/lib/operations/revision.ts',{hash,seoulDay:()=> '2026-09-30'});
    if(name.endsWith('/server-timing')) return {serverTiming:()=>timing};
    if(name.endsWith('/import-cache'))return {importSources:async()=>({docs:[]})};
    if(name.endsWith('/upcoming-billing'))return {billingHorizon:()=> '2026-10-15'};
    if(name.endsWith('/pass-history'))return {passCycleStarts:()=> []};
    if(name.endsWith('/attendance-sequence'))return {attendanceSequence:()=>({positions:{}})};
    if(name.endsWith('/model'))return {validDay:()=>{},seoulDay:()=> '2026-09-30'};
    if(name.endsWith('/notices'))return {noticeConfigured:()=>false};
    return {};
  });
  const request = since => new Request(`https://test/api/operations?day=2026-09-30&sync=1${since?'&since='+since:''}`);
  assert.equal((await GET(request())).status,401); assert.equal(reads.length,0);
  authorized=true;
  const first=await GET(request()); const snapshot=await first.json();
  assert.equal(first.status,200); assert.ok(snapshot.students); assert.equal(reads[0],'opsInvoices');
  assert.ok(reads.includes('opsAccounts')); reads.length=0;
  const same=await (await GET(request(snapshot.revision))).json();
  assert.deepEqual(same,{unchanged:true,revision:snapshot.revision}); assert.deepEqual(reads,['opsInvoices','opsAccounts','opsLessonReferences','opsAttendance','opsAccounts','opsLegacyCorrections']);
  scheduleStamp='schedule-two'; reads.length=0;
  const scheduleChanged=await(await GET(request(snapshot.revision))).json();
  assert.ok(scheduleChanged.students);assert.notEqual(scheduleChanged.revision,snapshot.revision);
  revisionStamp='two'; reads.length=0;
  const changed=await(await GET(request(scheduleChanged.revision))).json();
  assert.ok(changed.students); assert.notEqual(changed.revision,snapshot.revision);
  assert.equal(JSON.stringify(same).includes('private-id'),false);
  invoiceStamp='invoice-corrected';reads.length=0;const repaired=await(await GET(request(changed.revision))).json();assert.ok(repaired.students);assert.notEqual(repaired.revision,changed.revision);
});
test('snapshot reconciliation preserves calendar inputs when only unrelated notices change', () => {
  const {reconcileSnapshot}=load('src/lib/operations/snapshot-changes.ts');
  const current={day:'2026-09-30',students:[{id:'s'}],accounts:[{id:'s',remaining:3}],attendance:[],invoices:[],notices:[],payments:[],devices:[],configured:false};
  assert.equal(reconcileSnapshot(current,structuredClone(current)),current);
  const incoming=structuredClone(current); incoming.notices.push({id:'n'});
  const next=reconcileSnapshot(current,incoming);
  assert.equal(next.students,current.students); assert.equal(next.accounts,current.accounts); assert.equal(next.attendance,current.attendance);
  assert.notEqual(next.notices,current.notices);
});
