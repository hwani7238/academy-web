import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(file, dependency=require){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(dependency,exports);return exports;}
const {liveRefresh}=load('src/lib/operations/live-refresh.ts');
function harness(refresh){const jobs=new Map();let id=0,visible=true;const live=liveRefresh({refresh,visible:()=>visible,delay:(fn,ms)=>{jobs.set(++id,{fn,ms});return id;},cancel:id=>jobs.delete(id)});return {live,jobs,hide:()=>visible=false,show:()=>visible=true,tick:async()=>{const next=jobs.entries().next().value;if(next){jobs.delete(next[0]);next[1].fn();}await new Promise(r=>setImmediate(r));}};}
test('idle screen makes no requests; burst of changes fetches once and leaves no timer',async()=>{let calls=0;const h=harness(async()=>{calls++;return true;});assert.equal(h.jobs.size,0);h.live.changed();h.live.changed();h.live.changed();await h.tick();assert.equal(calls,1);assert.equal(h.jobs.size,0);});
test('a change during loading queues a second read without overlap',async()=>{let calls=0,release;const h=harness(async()=>{calls++;if(calls===1)await new Promise(r=>release=r);return true;});h.live.changed();await h.tick();h.live.changed();h.live.changed();assert.equal(calls,1);release();await new Promise(r=>setImmediate(r));await h.tick();assert.equal(calls,2);assert.equal(h.jobs.size,0);});
test('failed read retries; successful recovery leaves no periodic fetch',async()=>{let calls=0;const h=harness(async()=>++calls>1);h.live.changed();await h.tick();assert.equal(h.jobs.size,1);await h.tick();assert.equal(calls,2);assert.equal(h.jobs.size,0);});
test('hidden tab and disposed component do not keep fetching',async()=>{let calls=0;const h=harness(async()=>{calls++;return true;});h.hide();h.live.changed();assert.equal(h.jobs.size,0);h.show();h.live.changed();await h.tick();assert.equal(calls,1);h.live.changed();h.live.stop();await h.tick();assert.equal(calls,1);});
test('stop while a read is pending discards queued changes and retries',async()=>{let release,calls=0;const h=harness(async()=>{calls++;await new Promise(r=>release=r);return false;});h.live.changed();await h.tick();h.live.changed();h.live.stop();release();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(h.jobs.size,0);});

const {signalDatabase}=load('src/lib/operations/signal-store.ts');
function store(){
 const records=new Map(),commits=[];
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>({data:()=>records.get(path)}),update:()=>{throw Error('untracked write');}});
 function writer(){let writes=[];const w={get:async r=>({data:()=>records.get(r.path)}),commit:async()=>{commits.push(writes);for(const [kind,r,data]of writes){if(kind==='delete')records.delete(r.path);else records.set(r.path,kind==='update'?{...records.get(r.path),...data}:data);}return writes.map(()=>({writeTime:'now'}));}};for(const kind of ['set','create','update','delete'])w[kind]=(r,d,...extra)=>{writes.push([kind,r,d,...extra]);return w;};return w;}
 const raw={doc:ref,batch:writer,runTransaction:async work=>{const tx=writer();const result=await work(tx);await tx.commit();return result;}};
 return {db:signalDatabase(raw),raw,records,commits};
}
test('attendance, cancellation, time, payments and lifecycle writes commit one private signal atomically',async()=>{
 for(const [path,kind,data]of [['opsAttendance/a','create',{status:'present'}],['opsAttendance/a','update',{status:'cancelled'}],['opsAttendance/a','update',{arrivalAt:'12:00'}],['opsPayments/p','create',{amount:160000}],['students/s','update',{lifecycle:'paused'}],['opsAccounts/a','delete',undefined]]){
 const s=store();await s.db.runTransaction(async tx=>{await tx.get(s.db.doc(path));tx[kind](s.db.doc(path),data);});assert.equal(s.commits.length,1);assert.equal(s.commits[0].length,2);const signal=s.records.get('opsSignals/operations');assert.deepEqual(Object.keys(signal),['revision']);assert.match(signal.revision,/^[0-9a-f-]{36}$/);
 }
});
test('multiple related writes yield one notification; failed transaction yields none',async()=>{const s=store();await s.db.runTransaction(async tx=>{tx.update(s.db.doc('opsAccounts/a'),{remaining:7});tx.create(s.db.doc('opsAttendance/a'),{status:'present'});tx.create(s.db.doc('opsAudit/a'),{});});assert.equal(s.commits[0].filter(w=>w[1].path==='opsSignals/operations').length,1);const revision=s.records.get('opsSignals/operations').revision;await assert.rejects(s.db.runTransaction(async tx=>{tx.delete(s.db.doc('opsAttendance/a'));throw Error('abort');}));assert.equal(s.commits.length,1);assert.equal(s.records.get('opsSignals/operations').revision,revision);});
test('read-only calls, locks, feedback and keypad rate counters do not signal',async()=>{const s=store();await s.db.runTransaction(async tx=>{await tx.get(s.db.doc('opsAttendance/a'));});await s.db.runTransaction(async tx=>{tx.update(s.db.doc('opsDevices/d'),{requests:2,windowStart:123});tx.set(s.db.doc('opsIntegrityRuns/lock'),{leaseUntil:42});tx.set(s.db.doc('students/s/logs/l'),{feedback:'private'});});assert.equal(s.records.has('opsSignals/operations'),false);});
test('final notice updates and device revocation are atomic batch writes',async()=>{const s=store();const result=await s.db.doc('opsNotices/n').update({status:'submitted'});assert.deepEqual(result,{writeTime:'now'});assert.equal(s.commits[0].length,2);const first=s.records.get('opsSignals/operations').revision;await s.db.doc('opsDevices/d').update({active:false});assert.notEqual(s.records.get('opsSignals/operations').revision,first);});
test('integrity completion updates its own signal without reloading the entire ledger',async()=>{const s=store();await s.db.batch().set(s.db.doc('opsIntegrityStatus/latest'),{checkedAt:'now'}).commit();assert.equal(s.records.has('opsSignals/operations'),false);assert.ok(s.records.get('opsSignals/integrity'));});
test('signals use original references and preserve batch options',async()=>{const s=store();await s.db.doc('opsAccounts/a').set({remaining:8},{merge:true});assert.deepEqual(s.commits[0][0].slice(2),[{remaining:8},{merge:true}]);assert.equal(signalDatabase(s.raw),s.db);});

function events(){const handlers=new Map();return {addEventListener:(key,fn)=>{handlers.set(key,fn);},removeEventListener:key=>handlers.delete(key),fire:key=>handlers.get(key)?.()};}
test('listener ignores cached revisions, deduplicates server events, reconnects and cleans up',()=>{
 const oldDocument=global.document,oldWindow=global.window;global.document={...events(),visibilityState:'visible'};global.window=events();let next,fail,subscriptions=0,stops=0,changes=0,errors=0;
 try{
 const {watchOperations}=load('src/lib/operations/live-signals.ts',name=>name==='firebase/firestore'?{doc:(_db,...path)=>path.join('/'),onSnapshot:(path,opts,n,e)=>{assert.equal(path,'opsSignals/operations');subscriptions++;next=n;fail=e;return()=>stops++;}}:name==='./live-refresh'?{liveRefresh:()=>({changed:()=>changes++,stop:()=>stops++})}:{db:{}});
 const stop=watchOperations({refresh:async()=>true,failed:()=>errors++});
 const emit=(revision,fromCache=false)=>next({metadata:{fromCache},data:()=>({revision})});
 emit('v1',true);assert.equal(changes,0);emit('v1');emit('v1');assert.equal(changes,1);emit('v2');assert.equal(changes,2);
 global.window.fire('focus');assert.equal(subscriptions,1);
 global.document.visibilityState='hidden';global.document.fire('visibilitychange');assert.equal(stops,1);
 global.document.visibilityState='visible';global.document.fire('visibilitychange');emit('v2');assert.equal(changes,3);
 fail();assert.equal(errors,1);global.window.fire('online');emit('v3');assert.equal(changes,4);stop();assert.equal(stops,3);
 }finally{global.document=oldDocument;global.window=oldWindow;}
});
test('real Firestore SDK accepts tracked document references, overloads and serialized batches',async()=>{
 const {Firestore}=require('firebase-admin/firestore');const raw=new Firestore({projectId:'whee-signal-test'});const makeBatch=raw.batch.bind(raw);let serialized;
 raw.batch=()=>{const batch=makeBatch();batch.commit=async()=>{serialized=batch._ops.map(item=>item.op());return serialized.map(()=>({writeTime:'test'}));};return batch;};
 const db=signalDatabase(raw);await db.batch().create(db.doc('opsAttendance/a'),{status:'present'}).update(db.doc('opsAccounts/a'),'remaining',7).commit();
 assert.equal(serialized.length,3);assert.ok(serialized[2].update.name.endsWith('/opsSignals/operations'));assert.deepEqual(Object.keys(serialized[2].update.fields),['revision']);
 await db.doc('opsDevices/d').update('active',false);assert.equal(serialized.length,2);
 await db.doc('opsAccounts/a').set({remaining:8},{merge:true});assert.deepEqual(serialized[0].updateMask.fieldPaths,['remaining']);await raw.terminate();
});
