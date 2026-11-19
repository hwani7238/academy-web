import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.replace('@/', 'src/')+'.ts'),exports);return exports;}
test('piano data model includes teacher and owner-confirmed attendance but excludes leave and other instruments',()=>{
 const p=load('src/lib/teacher-attendance.ts'),day=p.koreaDay(),account={subject:'피아노'},owner={name:'학생',operationsCourseGroups:{피아노:'어린이 피아노 (1관)'}};
 const row={studentId:'piano',day,source:'teacher',status:'present',at:day+'T14:00:00+09:00',arrivalAt:day+'T13:30:00+09:00',updatedAt:'revision'};
 const result=p.teacherArrival('id',row,account,owner,day);assert.equal(result.course,'어린이 피아노');assert.equal(result.source,'teacher');assert.equal(result.updatedAt,'revision');assert.equal(result.arrivalAt,new Date(row.arrivalAt).toISOString());
 for(const patch of [{source:'unknown'},{status:'travel'},{status:'cancelled'},{day:'2000-01-01'}])assert.equal(p.teacherArrival('id',{...row,...patch},account,owner,day),null);
 assert.equal(p.teacherArrival('id',row,{subject:'기타'},owner,day),null);
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

test('manual save time is not exposed as arrival time; a separately corrected time is retained',()=>{
 const p=load('src/lib/teacher-attendance.ts'),day=p.koreaDay(),account={subject:'피아노'},owner={name:'학생'};
 const row={day,source:'manual',status:'present',at:day+'T14:00:00+09:00',studentId:'p'};
 assert.equal(p.teacherArrival('id',row,account,owner,day).arrivalAt,'');assert.equal(p.teacherArrival('id',row,account,owner,day).source,'manual');
 const arrivalAt=day+'T13:00:00+09:00';assert.equal(p.teacherArrival('id',{...row,arrivalAt},account,owner,day).arrivalAt,new Date(arrivalAt).toISOString());
});

test('date relay forwards only a validated date to the fixed backend',async()=>{
 const route=load('src/app/api/teacher/attendance/route.ts'),original=global.fetch,calls=[];
 global.fetch=async(url)=>{calls.push(url);return Response.json({day:'2026-11-17',arrivals:[],waiting:[]});};
 const req=query=>new Request('https://wheemusic.com/api/teacher/attendance?'+query,{headers:{Authorization:'Bearer test-token'}});
 try{
  assert.equal((await route.GET(req('day=2026-11-17&url=https://evil.example'))).status,200);assert.equal(calls[0],'https://manage.wheemusic.com/api/teacher/attendance?day=2026-11-17');
  for(const day of ['2026-02-30','bad',''])assert.equal((await route.GET(req('day='+day))).status,400);
  assert.equal(calls.length,1);
 }finally{global.fetch=original;}
});

test('drum profiles and course labels are supported without allowing unrelated or unapproved teachers',()=>{
 const p=load('src/lib/teacher-attendance.ts');
 assert.equal(p.canViewTeacherAttendance({role:'teacher',status:'approved',subjects:['드럼']}),true);
 for(const profile of [{role:'teacher',status:'pending',subjects:['드럼']},{role:'teacher',subjects:['기타'],subject:'드럼'},{role:'student',subject:'드럼'}])assert.equal(p.canViewTeacherAttendance(profile),false);
 const day=p.koreaDay(),row={day,source:'teacher',status:'present',studentId:'drum'};
 assert.equal(p.teacherArrival('drum',row,{subject:'드럼'},{name:'학생',instruments:['피아노','드럼']},day).course,'드럼');
 assert.equal(p.teacherArrival('drum',row,{subject:'기타',attendanceGroup:'드럼'},{name:'학생'},day),null);
});
