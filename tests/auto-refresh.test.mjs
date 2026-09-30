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
const { autoRefresh, ATTENDANCE_POLL_MS } = load('src/lib/operations/auto-refresh.ts');
function setup() {
  const state = { visible: true, time: 0, revision: 'before', reads: [], refreshes: 0, success: true };
  const live = autoRefresh({
    now: () => state.time, visible: () => state.visible,
    refresh: async since => {
      state.reads.push(since);
      if (!state.success) return false;
      const refreshed = since !== state.revision;
      if (refreshed) state.refreshes++;
      return { revision: state.revision, refreshed };
    },
  });
  return { state, live };
}
test('first load uses one request; unchanged polls are small; arrivals and periodic full refresh remain automatic', async () => {
  const { state, live } = setup();
  assert.equal(ATTENDANCE_POLL_MS, 5000);
  await live.check(); assert.deepEqual(state.reads, [undefined]); assert.equal(state.refreshes, 1);
  state.time = 5000; await live.check(); assert.equal(state.refreshes, 1);
  assert.equal(state.reads[1], 'before');
  state.revision = 'arrival'; await live.check(); assert.equal(state.refreshes, 2);
  state.time += 30000; await live.check(); assert.equal(state.refreshes, 3);
  assert.equal(state.reads.at(-1), undefined);
});
test('hidden tabs pause; simultaneous focus/visibility events do not double-load; later resume forces fresh data', async () => {
  const { state, live } = setup();
  await live.check(true); await live.check(true); assert.equal(state.reads.length, 1);
  state.visible = false; state.time += 5000;
  await live.check(true); assert.equal(state.reads.length, 1);
  state.visible = true; await live.check(true); assert.equal(state.refreshes, 2);
  live.stop(); await live.check(true); assert.equal(state.reads.length, 2);
});
test('checks do not overlap and an arrival during snapshot loading is fetched on the next check', async () => {
  let revision = 'before', reads = 0, release;
  const live = autoRefresh({ visible: () => true, refresh: async since => {
    reads++; const observed = revision;
    if (reads === 1) await new Promise(r => { release = r; });
    return { revision: observed, refreshed: since !== observed };
  } });
  const first = live.check(); await live.check(); assert.equal(reads, 1);
  revision = 'arrival'; release(); await first;
  await live.check(); assert.equal(reads, 2);
});
test('failed fetches and local writes do not consume revisions', async () => {
  const { state, live } = setup();
  await live.check(); state.revision = 'arrival'; state.success = false;
  await live.check(); state.success = true; await live.check();
  assert.deepEqual(state.reads, [undefined, 'before', 'before']);
  assert.equal(state.refreshes, 2);
});
test('stop discards queued forced refresh after in-flight response', async () => {
  let release, reads = 0;
  const live = autoRefresh({visible:()=>true, refresh:async()=>{reads++;await new Promise(r=>{release=r;});return {revision:'r',refreshed:true};}});
  const first=live.check(); await live.check(true); live.stop(); release(); await first;
  assert.equal(reads,1);
});
test('combined endpoint authorizes first; unchanged revision skips all ledger queries; full refresh reads a pre-snapshot revision', async () => {
  let authorized = false, revisionStamp = 'one'; const reads = [];
  const query = name => ({
    orderBy(){return this;},limit(){return this;},select(){return this;},where(){return this;},
    async get(){reads.push(name);return {docs:name==='opsAttendance'&&reads.length===1?[{id:'private-id',data:()=>({updatedAt:'time'}),updateTime:revisionStamp}]:[]};},
  });
  const hash = value => createHash('sha256').update(value).digest('hex');
  const timing = {measure:async(_name,work)=>work(),header:()=>''};
  const {GET} = load('src/app/api/operations/route.ts', name => {
    if(name.endsWith('/auth')) return {manager:async()=>{if(!authorized)throw Error('unauthorized');},database:()=>({collection:query}),hash,failure:()=>Response.json({}, {status:401})};
    if(name.endsWith('/server-timing')) return {serverTiming:()=>timing};
    if(name.endsWith('/import-cache'))return {importSources:async()=>({docs:[]})};
    if(name.endsWith('/attendance-sequence'))return {attendanceSequence:()=>({positions:{}})};
    if(name.endsWith('/model'))return {validDay:()=>{},seoulDay:()=> '2026-09-30'};
    if(name.endsWith('/notices'))return {noticeConfigured:()=>false};
    return {};
  });
  const request = since => new Request(`https://test/api/operations?day=2026-09-30&sync=1${since?'&since='+since:''}`);
  assert.equal((await GET(request())).status,401); assert.equal(reads.length,0);
  authorized=true;
  const first=await GET(request()); const snapshot=await first.json();
  assert.equal(first.status,200); assert.ok(snapshot.students); assert.equal(reads[0],'opsAttendance');
  assert.ok(reads.includes('opsAccounts')); reads.length=0;
  const same=await (await GET(request(snapshot.revision))).json();
  assert.deepEqual(same,{unchanged:true,revision:snapshot.revision}); assert.deepEqual(reads,['opsAttendance']);
  revisionStamp='two'; reads.length=0;
  const changed=await(await GET(request(snapshot.revision))).json();
  assert.ok(changed.students); assert.notEqual(changed.revision,snapshot.revision);
  assert.equal(JSON.stringify(same).includes('private-id'),false);
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
