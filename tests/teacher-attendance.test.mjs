import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file){const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);return exports;}
test('piano data model includes teacher-confirmed arrivals but excludes calendar edits and other instruments',()=>{
 const p=load('src/lib/teacher-attendance.ts'),day=p.koreaDay(),account={subject:'피아노'},owner={name:'학생',operationsCourseGroups:{피아노:'어린이 피아노 (1관)'}};
 const row={studentId:'piano',day,source:'teacher',status:'present',at:day+'T14:00:00+09:00',arrivalAt:day+'T13:30:00+09:00',updatedAt:'revision'};
 const result=p.pianoArrival('id',row,account,owner,day);assert.equal(result.source,'teacher');assert.equal(result.updatedAt,'revision');assert.equal(result.arrivalAt,new Date(row.arrivalAt).toISOString());
 for(const patch of [{source:'manual'},{status:'travel'},{status:'cancelled'},{day:'2000-01-01'}])assert.equal(p.pianoArrival('id',{...row,...patch},account,owner,day),null);
 assert.equal(p.pianoArrival('id',row,{subject:'드럼'},owner,day),null);
});
test('teacher API relay uses fixed management endpoint and preserves auth without forwarding user query targets',async()=>{
 const route=load('src/app/api/teacher/attendance/route.ts'),original=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});return Response.json({day:'2026-10-29',arrivals:[]});};
 try{
  let r=await route.GET(new Request('https://wheemusic.com/api/teacher/attendance'));assert.equal(r.status,401);assert.equal(calls.length,0);
  const request=(body,origin)=>new Request('https://wheemusic.com/api/teacher/attendance',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  r=await route.POST(request({action:'checkIn'},'https://evil.example'));assert.equal(r.status,403);assert.equal(calls.length,0);
  r=await route.GET(new Request('https://wheemusic.com/api/teacher/attendance?roster=1&url=https://evil.example&day=2000-01-01',{headers:{Authorization:'Bearer test-token'}}));assert.equal(r.status,200);
  assert.equal(calls[0].url,'https://manage.wheemusic.com/api/teacher/attendance?roster=1');assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');
  r=await route.POST(request({action:'correctTime',attendanceId:'id',time:'12:30'},'https://wheemusic.com'));assert.equal(r.status,200);assert.equal(calls[1].options.headers.Origin,'https://manage.wheemusic.com');assert.equal(JSON.parse(calls[1].options.body).time,'12:30');assert.match(r.headers.get('cache-control'),/no-store/);
  global.fetch=async()=>Response.json({error:'권한 없음'},{status:403});r=await route.GET(new Request('https://wheemusic.com/api/teacher/attendance',{headers:{Authorization:'Bearer invalid'}}));assert.equal(r.status,403);
  global.fetch=async()=>{throw Error('timeout');};r=await route.POST(request({action:'checkIn'},'https://wheemusic.com'));assert.equal(r.status,503);assert.match((await r.json()).error,/저장 여부/);
 }finally{global.fetch=original;}
});
