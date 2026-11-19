import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function render(data,selectedDay='',today=data.day,course='전체',order='name'){
 let index=0;const values=[data,'','ready',0,null,'',selectedDay,today,course,order];
 const load=(file)=>{const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id.startsWith('@/')?load(id.replace('@/','src/')+'.ts'):require(id),out);return out;};
 const exports={};const dependencies={'./AttendanceDateNav':load('src/components/AttendanceDateNav.tsx'),react:{useEffect:()=>{},useState:()=>[values[index++],()=>{}]},'next/link':{default:({children})=>children},'@/lib/teacher-attendance':{...load('src/lib/teacher-attendance.ts'),koreaDay:()=>today},'@/lib/teacher-attendance-events':{},'./TeacherArrivalDialog':{},'@/lib/firebase':{},'firebase/auth':{}};
 new Function('require','exports',ts.transpileModule(fs.readFileSync('src/components/TeacherAttendance.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(id=>dependencies[id]??require(id),exports);
 return renderToStaticMarkup(exports.TeacherAttendance());
}
test('waiting names are gray without an arrival time editor; checked-in names and Korea time are black',()=>{
 const data={day:'2026-11-18',arrivals:[{id:'a',studentId:'a',name:'나출석',course:'어린이 피아노',arrivalAt:'2026-11-18T06:05:00Z',status:'present',source:'kiosk'}],waiting:[{studentId:'b',name:'가예정',course:'어린이 피아노',lessonTime:'15:00',status:'waiting'}]};
 let html=render(data);
 assert.match(html,/text-\[#737373\]" data-attendance="waiting"/);assert.match(html,/text-black" data-attendance="arrived"/);
 assert.match(html,/나출석 등원 시간 수정/);assert.doesNotMatch(html,/가예정 등원 시간 수정/);assert.match(html,/15:05/);assert.match(html,/미출석/);
 assert.ok(html.indexOf('가예정')<html.indexOf('나출석'));
 data.arrivals.push({...data.arrivals[0],studentId:'b',id:'b',name:'가예정',arrivalAt:'2026-11-18T06:10:00Z'});data.waiting=[];
 html=render(data);assert.doesNotMatch(html,/data-attendance="waiting"/);assert.match(html,/가예정 등원 시간 수정/);assert.match(html,/15:10/);
});

test('manual attendance displays a black attended row and an honest missing-time label',()=>{
 const html=render({day:'2026-11-18',arrivals:[{id:'manual',studentId:'manual',name:'직접출석',course:'어린이 피아노',arrivalAt:'',status:'present',source:'manual'}],waiting:[]});
 assert.match(html,/text-black" data-attendance="arrived"/);assert.match(html,/수동 출석/);assert.match(html,/시간 미기록/);assert.match(html,/직접출석 등원 시간 수정/);assert.doesNotMatch(html,/data-attendance="waiting"/);
});

test('past dates show records without edit actions, future dates show plans, and old responses stay hidden',()=>{
 const today='2026-11-18',past={day:'2026-11-17',arrivals:[{id:'p',studentId:'p',name:'이전 출석',course:'어린이 피아노',arrivalAt:'2026-11-17T06:10:00Z',status:'present',source:'manual'}],waiting:[]};
 let html=render(past,past.day,today);assert.match(html,/2026-11-17 \(화\)/);assert.match(html,/15:10/);assert.doesNotMatch(html,/이전 출석 등원 시간 수정|\+ 출석/);assert.match(html,/이전 날짜/);assert.match(html,/다음 날짜/);assert.match(html,/오늘 날짜로 이동/);
 const future={day:'2026-11-19',arrivals:[],waiting:[{studentId:'p',name:'예정 학생',course:'어린이 피아노',status:'waiting',lessonTime:'15:00'}]};
 html=render(future,future.day,today);assert.match(html,/수업 예정/);assert.doesNotMatch(html,/>미출석<|\+ 출석/);
 html=render(past,future.day,today);assert.doesNotMatch(html,/이전 출석/);assert.match(html,/불러오는 중/);
});

test('course filter and time ordering keep unknown times and waiting students at the bottom in either direction',()=>{
 const day='2026-11-19',arrival=(id,name,time,course='어린이 피아노')=>({id,studentId:id,name,course,arrivalAt:time?day+'T'+time+':00+09:00':'',status:'present',source:'manual'});
 const data={day,arrivals:[arrival('later','가늦음','15:00'),arrival('early','하빠름','12:00','드럼'),arrival('unknown','나미기록','')],waiting:[{studentId:'waiting',name:'다예정',course:'드럼',status:'waiting',lessonTime:'10:00'}]};
 let html=render(data,'',day,'전체','earliest');assert.ok(html.indexOf('하빠름')<html.indexOf('가늦음'));assert.ok(html.indexOf('가늦음')<html.indexOf('나미기록'));assert.ok(html.indexOf('나미기록')<html.indexOf('다예정'));assert.match(html,/나중에 온 순으로 정렬/);assert.match(html,/aria-sort="ascending"/);
 html=render(data,'',day,'전체','latest');assert.ok(html.indexOf('가늦음')<html.indexOf('하빠름'));assert.ok(html.indexOf('하빠름')<html.indexOf('나미기록'));assert.ok(html.indexOf('나미기록')<html.indexOf('다예정'));assert.match(html,/빨리 온 순으로 정렬/);assert.match(html,/aria-sort="descending"/);
 html=render(data,'',day,'드럼','earliest');assert.match(html,/하빠름/);assert.match(html,/다예정/);assert.doesNotMatch(html,/가늦음|나미기록/);assert.match(html,/전체 2건/);
 html=render(data,'',day,'어린이 피아노');assert.match(html,/가늦음/);assert.doesNotMatch(html,/하빠름|다예정/);
});
