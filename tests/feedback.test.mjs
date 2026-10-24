import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function setup() {
 const records=new Map(),db={doc:path=>({path,collection:name=>({doc:()=>({path:`${path}/${name}/${Math.random()}`})})})};
 let queue=Promise.resolve();
 db.runTransaction=callback=>{
  const result=queue.then(async()=>{
   const writes=[];
   const tx={get:async ref=>({exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))}),update:(ref,value)=>writes.push(()=>records.set(ref.path,{...records.get(ref.path),...value})),create:(ref,value)=>writes.push(()=>records.set(ref.path,value))};
   const value=await callback(tx);writes.forEach(write=>write());return value;
  });queue=result.catch(()=>{});return result;
 };
 const cache={};
 function load(file) {
  if(cache[file])return cache[file].exports;
  const module={exports:{}};cache[file]=module;
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const custom=id=>{
   if(id==='@/lib/firebase-admin')return {adminDb:db,adminAuth:{verifyIdToken:async token=>{if(token==='invalid')throw Error('invalid');return {uid:token};}}};
   if(id==='firebase-admin/firestore')return {FieldValue:{serverTimestamp:()=>new Date().toISOString()}};
   if(id.startsWith('@/'))return load(`src/${id.slice(2)}.ts`);
   return require(id);
  };
  new Function('require','module','exports',source)(custom,module,module.exports);return module.exports;
 }
 const log={authorId:'teacher',progress:'old progress',feedback:'old feedback',reportToken:'parent-secret',mediaFiles:[{url:'same-media'}],createdAt:'2026-10-01',instrument:'드럼'};
 records.set('students/student/logs/log',structuredClone(log));records.set('users/teacher',{role:'teacher',status:'approved'});records.set('users/other',{role:'teacher',status:'approved'});records.set('users/owner',{role:'wonjang'});records.set('users/pending',{role:'teacher',status:'pending'});
 const edit=load('src/app/api/feedback/[studentId]/[logId]/route.ts'),report=load('src/app/api/report/[studentId]/[logId]/route.ts');
 const context={params:Promise.resolve({studentId:'student',logId:'log'})};
 const patch=(actor='teacher',body={progress:'new progress',feedback:'new feedback',expectedRevision:0},origin='https://wheemusic.com')=>edit.PATCH(new Request('https://wheemusic.com/api/feedback/student/log',{method:'PATCH',headers:{Authorization:`Bearer ${actor}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),context);
 const read=(query='t=parent-secret',actor)=>report.GET(new Request(`https://wheemusic.com/api/report/student/log?${query}`,{headers:actor?{Authorization:`Bearer ${actor}`}:{}}),context);
 return {records,log,patch,read,report,context,load};
}
test('author edits unread feedback, preserving media, token, date and attribution; stale editors cannot overwrite',async()=>{
 const s=setup();assert.equal((await s.patch()).status,200);
 const log=s.records.get('students/student/logs/log');assert.equal(log.feedback,'new feedback');assert.equal(log.editRevision,1);
 for(const key of ['mediaFiles','reportToken','createdAt','authorId','instrument'])assert.deepEqual(log[key],s.log[key]);
 assert.equal([...s.records.keys()].filter(k=>k.includes('/edits/')).length,1);
 assert.equal((await s.patch()).status,409);assert.equal(log.feedback,'new feedback');
 const response=await s.read();assert.equal(response.status,200);assert.equal((await response.json()).report.feedback,'new feedback');
 assert.equal((await s.patch('teacher',{progress:'',feedback:'too late',expectedRevision:1})).status,409);
});
test('every historic read marker blocks editing; owners cannot edit read feedback either',async()=>{
 for(const marker of [{viewed:true},{viewCount:1},{firstViewedAt:'date'},{lastViewedAt:'date'}])for(const actor of ['teacher','owner']){
  const s=setup();s.records.set('students/student/logs/log',{...s.log,...marker});assert.equal((await s.patch(actor)).status,409);
  assert.equal(s.records.get('students/student/logs/log').feedback,'old feedback');
 }
});
test('permissions, CSRF, revision and field validation cannot be bypassed',async()=>{
 for(const actor of ['other','pending','missing','invalid']){const s=setup();assert.ok([401,403].includes((await s.patch(actor)).status));assert.equal(s.records.get('students/student/logs/log').feedback,'old feedback');}
 const s=setup();assert.equal((await s.patch('owner')).status,200);
 assert.equal((await setup().patch('teacher',undefined,'https://evil.example')).status,403);
 for(const body of [{progress:'',feedback:'',expectedRevision:99},{progress:'',feedback:'',expectedRevision:0,viewed:false},{progress:'',feedback:'',expectedRevision:0,authorId:'other'},{progress:'',feedback:42,expectedRevision:0}])assert.ok([400,409].includes((await setup().patch('teacher',body)).status));
});
test('parent read and teacher edit serialize in either order; existing client POST does not double-count',async()=>{
 let s=setup();let [view,edit]=await Promise.all([s.read(),s.patch()]);assert.equal(view.status,200);assert.equal(edit.status,409);assert.equal((await view.json()).report.feedback,'old feedback');
 s=setup();const editing=s.patch();await new Promise(resolve=>setImmediate(resolve));[edit,view]=await Promise.all([editing,s.read()]);assert.equal(edit.status,200);assert.equal((await view.json()).report.feedback,'new feedback');
 await s.report.POST(new Request('https://wheemusic.com/api/report/student/log?t=parent-secret',{method:'POST'}),s.context);assert.equal(s.records.get('students/student/logs/log').viewCount,1);
});
test('staff preview requires verified approved staff, and report-token failures never mark read',async()=>{
 const s=setup();assert.equal((await s.read('t=parent-secret','teacher')).status,200);assert.equal(s.records.get('students/student/logs/log').viewed,undefined);
 for(const [query,actor] of [['t=wrong'],[''],['t=parent-secret','invalid'],['t=parent-secret','pending']])assert.ok([401,403].includes((await s.read(query,actor)).status));
 assert.equal(s.records.get('students/student/logs/log').viewed,undefined);
 assert.equal((await s.read('t=parent-secret&admin=true')).status,200);assert.equal(s.records.get('students/student/logs/log').viewed,true);
});
