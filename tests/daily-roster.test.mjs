import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const exports={};modules.set(name,exports);new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join('src/lib/operations',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.slice(2)),exports);return exports;}
const {dailyExpectedLessons}=load('daily-roster');
const day='2026-11-18';
function fixture(){
 const ids=['regular','moved-away','moved-in','makeup','sick','paused','withdrawn','inactive','unscheduled','manual','new-rule'];
 const accounts=ids.map(id=>({id,active:id!=='inactive',schedule:{rules:[{start:'2026-11-01',weekdays:['makeup','unscheduled','moved-in'].includes(id)?[1]:[3],times:{3:{start:'15:00',end:''}}}],moves:[]}}));
 accounts.find(a=>a.id==='moved-away').schedule.moves=[{from:day,to:'2026-11-19'}];
 accounts.find(a=>a.id==='moved-in').schedule.moves=[{from:'2026-11-16',to:day,time:{start:'16:00',end:''}}];
 accounts.find(a=>a.id==='new-rule').schedule.rules.push({start:day,weekdays:[1]});
 const students=ids.map(id=>({id,...(id==='withdrawn'?{lifecycle:{status:'withdrawn',until:''}}:{})}));
 const attendance=[{studentId:'makeup',day,status:'makeup_reserved'},{studentId:'sick',day,status:'sick'},{studentId:'paused',day,status:'paused'},{studentId:'manual',day,status:'present',source:'manual'}];
 return {accounts,students,attendance};
}
test('expected lessons include date moves and makeup reservations, respect effective rules and lifecycle, and never fabricate arrivals',()=>{
 const data=fixture(),before=structuredClone(data),rows=dailyExpectedLessons(data,day);
 assert.deepEqual(rows.map(r=>r.studentId),['regular','moved-in','makeup','sick','manual']);
 assert.equal(rows.find(r=>r.studentId==='moved-in').lessonTime,'16:00');
 assert.equal(rows.find(r=>r.studentId==='sick').status,'sick');
 assert.equal(rows.find(r=>r.studentId==='makeup').status,'makeup_reserved');
 assert.equal(rows.find(r=>r.studentId==='manual').status,'waiting');
 assert.deepEqual(data,before);
});
test('closed academy days do not create regular expected students, and expired leave resumes normally',()=>{
 const data={accounts:[{id:'p',active:true,schedule:{rules:[{start:'2026-10-01',weekdays:[1]}],moves:[]}}],students:[{id:'p',lifecycle:{status:'paused',until:'2026-10-04'}}],attendance:[]};
 assert.deepEqual(dailyExpectedLessons(data,'2026-10-05'),[]);
 assert.equal(dailyExpectedLessons(data,'2026-10-12').length,1);
});
