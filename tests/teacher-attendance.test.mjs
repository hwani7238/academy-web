import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function setup() {
  const records = new Map();
  const reads = [], writes = [];
  const snapshot = (key, fields) => ({ id: key.split('/').at(-1), exists: records.has(key), data: () => {
    const data = records.get(key);
    return !data ? undefined : fields ? Object.fromEntries(fields.filter(field => field in data).map(field => [field, data[field]])) : structuredClone(data);
  } });
  const db = {
    doc: key => ({ key, get: async () => snapshot(key) }),
    getAll: async (...args) => { const options = args.pop(); return args.map(ref => snapshot(ref.key, options.fieldMask)); },
    collection: name => ({ where: (field, operator, value) => ({ select: (...fields) => ({ get: async () => {
      reads.push({ name, field, operator, value });
      return { docs: [...records].filter(([key, data]) => key.startsWith(name + '/') && data[field] === value).map(([key]) => snapshot(key, fields)) };
    } }) }) }),
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'exports', code)(id => id === '@/lib/operations/service' ? {teacherCheckIn:async(input,actor)=>{writes.push({input,actor});return {duplicate:false};},correctTeacherAttendanceTime:async(input,actor)=>{writes.push({input,actor});}} : id === '@/lib/firebase-admin' ? { adminDb: db, adminAuth: { verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (token === 'invalid') throw Error('invalid'); return { uid: token }; } } } : id.startsWith('@/') ? load(path.join('src', id.slice(2) + '.ts')) : id.startsWith('./') ? load(path.join(path.dirname(file), id + '.ts')) : require(id), exports);
    return exports;
  }
  const policy = load('src/lib/teacher-attendance.ts');
  const route = load('src/app/api/teacher/attendance/route.ts');
  const day = policy.koreaDay();
  const call = (actor, query = '') => route.GET(new Request('https://wheemusic.com/api/teacher/attendance' + query, { headers: actor ? { Authorization: `Bearer ${actor}` } : {} }));
  records.set('users/piano', { role: 'teacher', status: 'approved', subjects: ['피아노'] });
  return { records, reads, writes, call, route, policy, day };
}
test('only approved piano staff and administrators can read; no attendance reads on rejection', async () => {
  const s = setup();
  for (const [id, profile] of Object.entries({ pending: { role: 'teacher', status: 'pending', subject: '피아노' }, rejected: { role: 'teacher', status: 'rejected', subject: '피아노' }, revoked: { role: 'teacher', status: 'disabled', subjects: ['피아노'] }, drum: { role: 'teacher', subjects: ['드럼'] }, staleSubject: { role: 'teacher', subjects: ['드럼'], subject: '피아노' }, student: { role: 'student', subject: '피아노' } })) s.records.set('users/' + id, profile);
  for (const actor of [undefined, 'invalid', 'missing', 'pending', 'rejected', 'revoked', 'drum', 'staleSubject', 'student']) assert.ok([401, 403].includes((await s.call(actor)).status));
  assert.equal(s.reads.length, 0);
  for (const profile of [{ role: 'admin' }, { role: 'wonjang' }, { role: 'siljang' }, { role: 'teacher', subject: '피아노' }, { role: 'teacher', status: 'approved', subjects: ['드럼', '피아노'] }]) {
    s.records.set('users/allowed', profile); assert.equal((await s.call('allowed')).status, 200);
  }
  s.records.set('users/piano', { role: 'teacher', status: 'rejected', subjects: ['피아노'] });
  assert.equal((await s.call('piano')).status, 403);
});
test('today-only read returns all piano groups with an explicit privacy allowlist', async () => {
  const s = setup(), arrival = new Date(s.day + 'T15:20:00+09:00').toISOString();
  for (const [id, subject] of [['one', '어린이 피아노 (1관)'], ['two', '어린이 피아노 (2관)'], ['adult', '성인 피아노'], ['drum', '드럼']]) {
    s.records.set('opsAccounts/' + id, { name: '학생 · ' + subject, sourceStudentId: 'owner-' + id, subject, remaining: -2, planAmount: 180000, phone: 'secret' });
    s.records.set('students/owner-' + id, { name: '학생 ' + id, instruments: ['피아노', '드럼'], teachers: { 피아노: 'another-teacher' }, phone: 'secret' });
    s.records.set('opsAttendance/' + id, { studentId: id, day: s.day, source: 'kiosk', status: 'present', at: arrival, units: 1, note: 'private', phone: 'secret' });
  }
  const response = await s.call('piano', '?day=2000-01-01&subject=드럼&studentId=drum');
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await response.json(); assert.equal(result.day, s.day); assert.equal(result.arrivals.length, 3);
  assert.ok(result.arrivals.every(row => row.course.includes('피아노')));
  assert.deepEqual(Object.keys(result.arrivals[0]).sort(), ['arrivalAt', 'course', 'id', 'name', 'source', 'status', 'studentId', 'updatedAt']);
  assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!JSON.stringify(result).includes('private'));
  assert.deepEqual(s.reads, [{ name: 'opsAttendance', field: 'day', operator: '==', value: s.day }]);
});
test('daily arrivals match the manager kiosk criteria and preserve corrected Korea time', () => {
  const s = setup(), at = s.day + 'T09:00:00+09:00', arrivalAt = s.day + 'T10:30:00+09:00';
  const account = { subject: '피아노' }, owner = { name: '학생', operationsCourseGroups: { 피아노: '어린이 피아노 (2관)' } };
  const base = { day: s.day, source: 'kiosk', status: 'present', at, arrivalAt };
  for (const changed of [{ source: 'manual' }, { day: '2000-01-01' }, ...['cancelled', 'late_cancel', 'absent', 'travel', 'sick', 'paused', 'makeup_reserved'].map(status => ({ status }))]) assert.equal(s.policy.pianoArrival('id', { ...base, ...changed }, account, owner, s.day), null);
  assert.equal(s.policy.pianoArrival('id', base, account, owner, s.day).arrivalAt, new Date(arrivalAt).toISOString());
  assert.equal(s.policy.pianoArrival('id', { ...base, status: 'makeup' }, account, owner, s.day).status, 'makeup');
  assert.equal(s.policy.pianoArrival('id', base, { subject: '드럼' }, owner, s.day), null);
  assert.equal(s.policy.pianoArrival('id', base, undefined, owner, s.day), null);
  assert.equal(s.policy.pianoArrival('id', { ...base, arrivalAt: 'invalid' }, account, owner, s.day).arrivalAt, '');
  assert.equal(s.policy.koreaDay(new Date('2026-10-28T15:00:00Z')), '2026-10-29');
  assert.equal(typeof s.route.POST, 'function'); assert.equal(s.route.PATCH, undefined); assert.equal(s.route.DELETE, undefined);
});

test('teacher writes require a valid role and same origin, and only expose success',async()=>{
 const s=setup(),input={action:'checkIn',day:s.day,studentId:'piano-a',time:'09:00'};
 const call=(actor,origin,body=input)=>s.route.POST(new Request('https://manage.wheemusic.com/api/teacher/attendance',{method:'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:`Bearer ${actor}`}:{ }),...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}));
 for(const actor of [undefined,'invalid','missing'])assert.ok([401,403].includes((await call(actor,'https://manage.wheemusic.com')).status));
 s.records.set('users/drum',{role:'teacher',subjects:['드럼']});assert.equal((await call('drum','https://manage.wheemusic.com')).status,403);
 assert.equal((await call('piano','https://evil.example')).status,403);assert.equal((await call('piano',undefined)).status,403);assert.equal(s.writes.length,0);
 const r=await call('piano','https://manage.wheemusic.com');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,duplicate:false});assert.equal(s.writes[0].actor,'teacher:piano');
 assert.equal((await call('piano','https://manage.wheemusic.com',{...input,action:'payment'})).status,400);assert.equal(s.writes.length,1);
});
test('teacher arrivals are visible, manual calendar rows remain excluded and roster hides private data',async()=>{
 const s=setup();
 for(const[id,subject,state]of[['piano','피아노','active'],['drum','드럼','active'],['paused','피아노','paused']]){
  s.records.set('opsAccounts/'+id,{active:true,subject,sourceStudentId:id,name:'학생',phone:'private-phone',remaining:8});
  s.records.set('students/'+id,{name:id,instruments:[subject],lifecycle:{status:state,until:'2999-01-01'}});
 }
 s.records.set('opsAttendance/arrival',{studentId:'piano',day:s.day,source:'teacher',status:'present',arrivalAt:s.day+'T09:10:00+09:00',updatedAt:'revision'});
 const result=await(await s.call('piano')).json();assert.equal(result.arrivals.length,1);assert.equal(result.arrivals[0].source,'teacher');assert.equal(result.arrivals[0].updatedAt,'revision');
 const roster=await(await s.call('piano','?roster=1')).json();assert.deepEqual(roster.students,[{id:'piano',name:'piano',course:'피아노',attended:true}]);assert.ok(!JSON.stringify(roster).includes('private-phone'));
});
