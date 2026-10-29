import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file,dependencies={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>dependencies[id],exports);return exports;}
const policy=load('src/lib/teacher-attendance.ts');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function server(role={role:'teacher',subject:'피아노',status:'approved'}){
 let changed,profileChanged,listenerError,queries=0,stops=0;
 const profile={get:async()=>({data:()=>role}),onSnapshot:callback=>{profileChanged=callback;return ()=>stops++;}};
 const db={doc:path=>{assert.equal(path,'users/teacher');return profile;},collection:name=>{assert.equal(name,'opsAttendance');return {where:(field,op,day)=>{assert.deepEqual([field,op,day],['day','==',policy.koreaDay()]);queries++;return {onSnapshot:(callback,error)=>{changed=callback;listenerError=error;return ()=>stops++;}};}};}};
 const route=load('src/app/api/teacher/attendance/events/route.ts',{'@/lib/teacher-attendance':policy,'@/lib/firebase-admin':{adminDb:db,adminAuth:{verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='invalid')throw Error('invalid');return {uid:'teacher',exp:Math.floor(Date.now()/1000)+3600};}}}});
 return {route,get queries(){return queries;},get stops(){return stops;},changed:()=>changed({docs:[{data:()=>({phone:'private',amount:999,note:'private'})}]}),revoke:()=>profileChanged({data:()=>({role:'teacher',subject:'피아노',status:'rejected'})}),error:()=>listenerError(Error('offline'))};
}
const request=(token='valid',signal)=>new Request('https://wheemusic.com/api/teacher/attendance/events?day=2000-01-01',{headers:token?{Authorization:`Bearer ${token}`}:{},signal});
const decode=chunk=>new TextDecoder().decode(chunk.value);
test('stream requires a valid token and approved piano role before reading attendance',async()=>{
 for(const [profile,token,status] of [[undefined,'',401],[undefined,'invalid',401],[{role:'teacher',subject:'드럼',status:'approved'},'valid',403],[{role:'teacher',subject:'피아노',status:'pending'},'valid',403]]){const s=server(profile);assert.equal((await s.route.GET(request(token))).status,status);assert.equal(s.queries,0);}
});
test('initial snapshot, edits and removals emit only change signals; cancellation closes subscriptions',async()=>{
 const s=server(),response=await s.route.GET(request()),reader=response.body.getReader();assert.match(response.headers.get('content-type'),/text\/event-stream/);assert.match(response.headers.get('cache-control'),/no-store/);
 for(let i=0;i<3;i++){s.changed();const frame=decode(await reader.read());assert.deepEqual(JSON.parse(frame.slice(6)),{type:'changed',day:policy.koreaDay()});assert.doesNotMatch(frame,/private|phone|amount/);}
 await reader.cancel();assert.equal(s.stops,2);
});
test('role revocation, listener failure and disconnected clients clean up the server',async()=>{
 for(const mode of ['revoke','error','abort']){const s=server(),abort=new AbortController(),response=await s.route.GET(request('valid',abort.signal)),reader=response.body.getReader();if(mode==='abort')abort.abort();else{s[mode]();assert.match(decode(await reader.read()),mode==='revoke'?/denied/:/retry/);}assert.equal((await reader.read()).done,true);assert.equal(s.stops,2);}
 const s=server(),abort=new AbortController();abort.abort();const response=await s.route.GET(request('valid',abort.signal));assert.equal((await response.body.getReader().read()).done,true);assert.equal(s.queries,0);
});
test('client consumes split change frames without 15-second polling, reconnects on EOF, and stops cleanly',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const original=global.fetch;let output,requests=0,changes=0;const states=[];
 global.fetch=async()=>{requests++;return new Response(new ReadableStream({start(c){output=c;}}),{headers:{'Content-Type':'text/event-stream'}});};
 const {watchTeacherAttendance}=load('src/lib/teacher-attendance-events.ts');const stop=watchTeacherAttendance({token:async()=>'token',changed:()=>changes++,connected:x=>states.push(x),denied:()=>assert.fail('unexpected denial')});
 try{await settle();const encode=new TextEncoder();output.enqueue(encode.encode('data: {"type":"cha'));output.enqueue(encode.encode('nged"}\n\n: keepalive\n\n'));await settle();assert.equal(changes,1);assert.equal(states.at(-1),true);t.mock.timers.tick(15000);await settle();assert.equal(requests,1);output.enqueue(encode.encode('data: {"type":"changed"}\n\n'));await settle();assert.equal(changes,2);output.close();await settle();t.mock.timers.tick(1000);await settle();assert.equal(requests,2);stop();output.close();await settle();t.mock.timers.tick(60000);await settle();assert.equal(requests,2);}
 finally{stop();global.fetch=original;t.mock.timers.reset();}
});
test('client stops retrying when access is denied',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const original=global.fetch;let requests=0,denied;global.fetch=async()=>{requests++;return new Response('',{status:403});};
 const {watchTeacherAttendance}=load('src/lib/teacher-attendance-events.ts'),stop=watchTeacherAttendance({token:async()=>'token',changed:()=>assert.fail(),connected:()=>{},denied:status=>{denied=status;}});
 try{await settle();assert.equal(denied,403);t.mock.timers.tick(60000);await settle();assert.equal(requests,1);}finally{stop();global.fetch=original;t.mock.timers.reset();}
});

test('a cancellation during an in-flight read is not lost, and logout discards late responses',async()=>{
 const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),original={fetch:global.fetch,document:global.document,window:global.window};
 const listeners=new Map(),effects=[],state=[];let cursor=0,authCallback,subscription;const pending=[];
 global.document={visibilityState:'visible',addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};
 global.window={addEventListener(){},removeEventListener(){}};
 global.fetch=()=>new Promise(resolve=>pending.push(resolve));
 const hooks={useEffect:fn=>effects.push(fn),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];}};
 const dependencies={'react':hooks,'next/link':{default:()=>null},'lucide-react':{Pencil:()=>null,Clock3:()=>null},'./TeacherArrivalDialog':{TeacherArrivalDialog:()=>null},'@/lib/teacher-attendance':policy,'@/lib/firebase':{auth:{currentUser:null}},'firebase/auth':{onAuthStateChanged:(_,fn)=>{authCallback=fn;return ()=>{};}},'@/lib/teacher-attendance-events':{watchTeacherAttendance:options=>{subscription=options;return ()=>{};}}};
 const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync('src/components/TeacherAttendance.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(id=>dependencies[id]??require(id),exports);
 let cleanup;
 try{
  exports.TeacherAttendance();cleanup=effects[0]();authCallback({getIdToken:async()=>'valid'});await settle();assert.equal(pending.length,1);
  subscription.changed();subscription.changed();pending[0](Response.json({day:policy.koreaDay(),arrivals:[{id:'removed-student'}]}));await settle();assert.equal(pending.length,2,'queued changes must trigger one fresh read after the current read');
  pending[1](Response.json({day:policy.koreaDay(),arrivals:[]}));await settle();assert.deepEqual(state[0].arrivals,[]);
  subscription.changed();await settle();assert.equal(pending.length,3);authCallback(null);pending[2](Response.json({day:policy.koreaDay(),arrivals:[{id:'private'}]}));await settle();assert.equal(state[0],null);assert.equal(state[2],'signed-out');
 }finally{cleanup?.();Object.assign(global,original);}
});
