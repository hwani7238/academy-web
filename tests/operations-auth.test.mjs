import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loadAuth(role = 'wonjang', status = 'approved') {
 const rows=new Map([['users/user',{role,status}]]);
 const ref=path=>({path});
 const db={doc:ref,runTransaction:async fn=>fn({get:async r=>({data:()=>rows.get(r.path)}),update:(r,d)=>rows.set(r.path,{...rows.get(r.path),...d})})};
 db.doc=path=>({path,get:async()=>({data:()=>rows.get(path)})});
 const code=ts.transpileModule(fs.readFileSync('src/lib/operations/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',code)(name=>name==='@/lib/firebase-admin'?{adminDb:db,adminAuth:{verifyIdToken:async token=>{if(token!=='valid')throw Error('bad');return {uid:'user'};}}}:require(name),exports);
 return {auth:exports,rows};
}
test('finance rejects teachers, pending teachers, and manager role without owner access',async()=>{
 for(const [role,status] of [['teacher','approved'],['teacher','pending'],['siljang','approved'],['unknown','approved']]){
  const {auth}=loadAuth(role,status);await assert.rejects(auth.manager(new Request('https://example.test/api/operations',{headers:{Authorization:'Bearer valid'}})),{status:403});
 }
});
test('owner accepted, missing or invalid session rejected',async()=>{
 const {auth}=loadAuth();assert.equal(await auth.manager(new Request('https://example.test',{headers:{Authorization:'Bearer valid'}})),'user');
 await assert.rejects(auth.manager(new Request('https://example.test')),{status:401});await assert.rejects(auth.manager(new Request('https://example.test',{headers:{Authorization:'Bearer bad'}})),{status:401});
});
test('cross-origin kiosk actions rejected',()=>{
 const {auth}=loadAuth();assert.throws(()=>auth.sameOrigin(new Request('https://academy.test/api/check-in',{headers:{Origin:'https://other.test'}})),{status:403});assert.doesNotThrow(()=>auth.sameOrigin(new Request('https://academy.test/api/check-in',{headers:{Origin:'https://academy.test'}})));
});
test('kiosk cookie required, revocation and expiry enforced, repeated requests throttled',async()=>{
 const {auth,rows}=loadAuth();await assert.rejects(auth.device(new Request('https://academy.test')),{status:401});
 const token='a'.repeat(64);const id=auth.hash(token);const path=`opsDevices/${id}`;const request=new Request('https://academy.test',{headers:{Cookie:`whee_device=${token}`}});
 rows.set(path,{active:true,expiresAt:Date.now()+100000});assert.equal(await auth.device(request),id);
 rows.get(path).active=false;await assert.rejects(auth.device(request),{status:401});rows.get(path).active=true;rows.get(path).expiresAt=0;await assert.rejects(auth.device(request),{status:401});
 rows.set(path,{active:true,expiresAt:Date.now()+100000,windowStart:Date.now(),requests:60});await assert.rejects(auth.device(request),{status:429});
});
test('scheduled worker rejects absent secret rather than allowing anonymous execution',()=>{
 const {auth}=loadAuth();const previous=process.env.CRON_SECRET;delete process.env.CRON_SECRET;
 try{assert.throws(()=>auth.cron(new Request('https://academy.test')),{status:401});process.env.CRON_SECRET='test-secret';assert.throws(()=>auth.cron(new Request('https://academy.test',{headers:{Authorization:'Bearer wrong'}})),{status:401});assert.doesNotThrow(()=>auth.cron(new Request('https://academy.test',{headers:{Authorization:'Bearer test-secret'}})));}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
