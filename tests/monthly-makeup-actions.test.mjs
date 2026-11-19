import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the actual calendar button handlers without a browser or production writes.
const source=ts.createSourceFile('MonthlyAttendance.tsx',fs.readFileSync('src/components/operations/MonthlyAttendance.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression;
function visit(node){
 if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.text==='className'&&p.initializer?.text==='quick-attendance-options'))expression=node.children.find(ts.isJsxExpression)?.expression;
 ts.forEachChild(node,visit);
}
visit(source);assert.ok(expression,'calendar quick actions must be rendered');
const code=ts.transpileModule(`export function render(ctx:any){const {selected,today,current,busy,saving,selectedCyclePaid,course,lookup,relatedDay,defaultAttendanceUnits,ATTENDANCE_LABELS,setStatus,setUnits,setDetailed,commit}=ctx;return ${expression.getText(source)};}`,{fileName:'actions.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('require','exports',code)(()=>({jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}),exports);
function actions(day,current){
 const changes={};const buttons=exports.render({selected:{studentId:'student',day},today:'2026-11-19',current,busy:false,saving:false,selectedCyclePaid:false,course:'피아노',lookup:new Map(),relatedDay:'2026-11-14',defaultAttendanceUnits:s=>['present','makeup'].includes(s)?1:0,ATTENDANCE_LABELS:{makeup:'보강',makeup_reserved:'보강 예약'},setStatus:s=>changes.status=s,setUnits:n=>changes.units=n,setDetailed:v=>changes.detailed=v,commit:()=>assert.fail('makeup must open the origin-date form before saving')});
 const find=label=>buttons.find(b=>b.props.children[0].props.children===label);
 return {find,changes};
}
test('today offers distinct reservation and completed makeup actions; reservation never deducts',()=>{
 const {find,changes}=actions('2026-11-19');
 const booking=find('보강 예약'),completed=find('보강 완료');assert.ok(booking);assert.ok(completed);assert.equal(booking.props.disabled,false);
 booking.props.onClick();assert.deepEqual(changes,{status:'makeup_reserved',units:0,detailed:true});
 completed.props.onClick();assert.deepEqual(changes,{status:'makeup',units:1,detailed:true});
});
test('a reservation stays a reservation when edited on its due date',()=>{
 const {find,changes}=actions('2026-11-19',{status:'makeup_reserved',units:0});
 find('보강 예약').props.onClick();assert.equal(changes.status,'makeup_reserved');assert.equal(changes.units,0);
 find('보강 완료').props.onClick();assert.equal(changes.status,'makeup');
});
test('future makeup can only be reserved, and past dates retain completed makeup correction',()=>{
 const future=actions('2026-11-20');assert.equal(future.find('보강 예약').props.disabled,false);assert.equal(future.find('보강 완료').props.disabled,true);
 future.find('보강 예약').props.onClick();assert.equal(future.changes.status,'makeup_reserved');assert.equal(future.changes.units,0);
 const past=actions('2026-11-18');assert.equal(past.find('보강 예약'),undefined);assert.equal(past.find('보강 완료').props.disabled,false);
});
