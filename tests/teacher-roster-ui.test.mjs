import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function render(data){
 let index=0;const values=[data,'','ready',0,null,''];
 const exports={};const dependencies={react:{useEffect:()=>{},useState:()=>[values[index++],()=>{}]},'next/link':{default:({children})=>children},'@/lib/teacher-attendance':{koreaDay:()=>data.day},'@/lib/teacher-attendance-events':{},'./TeacherArrivalDialog':{},'@/lib/firebase':{},'firebase/auth':{}};
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
