import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

function load(file, dependency) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(() => dependency, exports);
  return exports;
}
const { autoRefresh, ATTENDANCE_POLL_MS } = load('src/lib/operations/auto-refresh.ts');
function setup() {
  const state = { visible: true, time: 0, revision: 'before', reads: 0, refreshes: 0, success: true, offline: false };
  const live = autoRefresh({
    now: () => state.time, visible: () => state.visible,
    revision: async () => { state.reads++; if (state.offline) throw Error('offline'); return state.revision; },
    refresh: async () => { state.refreshes++; return state.success; },
  });
  return { state, live };
}
test('another device arrival refreshes the snapshot on the next check, without reloading unchanged ledgers', async () => {
  const { state, live } = setup();
  assert.equal(ATTENDANCE_POLL_MS, 5000);
  await live.check(); assert.equal(state.refreshes, 1);
  state.time = 5000; await live.check(); assert.equal(state.refreshes, 1);
  state.revision = 'arrival'; await live.check(); assert.equal(state.refreshes, 2);
  state.time += 30000; await live.check(); assert.equal(state.refreshes, 3);
});
test('hidden tabs pause reads, return/online forces refresh, disposal ignores late responses', async () => {
  const { state, live } = setup();
  await live.check(); state.visible = false;
  await live.check(true); assert.equal(state.reads, 1);
  state.visible = true; await live.check(true); assert.equal(state.refreshes, 2);
  live.stop(); await live.check(true); assert.equal(state.reads, 2);
  let release, updates = 0;
  const pending = autoRefresh({ visible: () => true, revision: () => new Promise(r => { release = r; }), refresh: async () => { updates++; return true; } });
  const check = pending.check(); pending.stop(); release('late'); await check;
  assert.equal(updates, 0);
});
test('checks do not overlap and an arrival during snapshot loading is fetched on the next check', async () => {
  let revision = 'before', reads = 0, updates = 0, release;
  const live = autoRefresh({ visible: () => true, revision: async () => { reads++; return revision; }, refresh: async () => { updates++; if (updates === 1) await new Promise(r => { release = r; }); return true; } });
  const first = live.check(); await Promise.resolve();
  await live.check(); assert.equal(reads, 1);
  revision = 'arrival'; release(); await first;
  await live.check(); assert.equal(updates, 2);
});
test('local writes and failed fetches do not consume the revision, and polling recovers after disconnection', async () => {
  const { state, live } = setup();
  await live.check(); state.revision = 'arrival'; state.success = false;
  await live.check(); state.success = true; await live.check();
  assert.equal(state.refreshes, 3);
  state.offline = true; state.time = 30000; state.success = false;
  await live.check(); assert.equal(state.refreshes, 4);
  state.offline = false; state.success = true;
  await live.check(); assert.equal(state.refreshes, 5);
});
test('revision endpoint requires a manager, reads one attendance record and returns no student details', async () => {
  let authorized = false, reads = 0, stamp = 'commit-1';
  const query = {
    orderBy: (field, direction) => { assert.deepEqual([field, direction], ['updatedAt', 'desc']); return query; },
    limit: count => { assert.equal(count, 1); return query; },
    select: field => { assert.equal(field, 'updatedAt'); return query; },
    get: async () => { reads++; return { docs: [{ id: 'private-student-id', data: () => ({ updatedAt: 'time' }), updateTime: stamp }] }; },
  };
  const { GET } = load('src/app/api/operations/revision/route.ts', {
    manager: async () => { if (!authorized) throw Error('unauthorized'); },
    database: () => ({ collection: name => { assert.equal(name, 'opsAttendance'); return query; } }),
    hash: value => createHash('sha256').update(value).digest('hex'),
    failure: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  });
  const request = new Request('https://test/api/operations/revision');
  assert.equal((await GET(request)).status, 401); assert.equal(reads, 0);
  authorized = true;
  const response = await GET(request), first = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(first), ['revision']);
  assert.equal(JSON.stringify(first).includes('private-student'), false);
  assert.deepEqual(await (await GET(request)).json(), first);
  stamp = 'commit-2'; assert.notDeepEqual(await (await GET(request)).json(), first);
});
