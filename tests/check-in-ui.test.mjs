import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const code = ts.transpileModule(fs.readFileSync('src/components/operations/CheckIn.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick = () => new Promise(resolve=>setImmediate(resolve));
const screens = new Set();
afterEach(()=>{for(const dispose of screens)dispose();screens.clear();});
function screen(matches, save = async id=>({name:id})) {
  const state=[];let cursor=0,tree,effects=[];const calls=[],lookups=[],cleanups=new Map();
  const hooks={
    useEffect(fn,deps){const i=cursor++,old=state[i];if(!old||deps.some((v,j)=>!Object.is(v,old[j]))){state[i]=deps;effects.push(()=>{cleanups.get(i)?.();cleanups.set(i,fn());});}},
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
    useRef(initial){const i=cursor++;return state[i]??={current:initial};}
  };
  const exports={};new Function('require','exports',code)(id=>id==='react'?hooks:id.endsWith('.css')?{}:require(id),exports);
  const render=()=>{cursor=0;effects=[];tree=exports.CheckIn({demo:{lookup:digits=>{lookups.push(digits);return matches;},checkIn:async id=>{calls.push(id);return save(id);}}});effects.forEach(fn=>fn());};
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return [node,...nodes(node.props?.children??null)];}
  const find=predicate=>nodes().find(predicate);
  const text=(node=tree)=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children??null):'';
  render();screens.add(()=>{for(const cleanup of cleanups.values())cleanup?.();});
  return {calls,lookups,render,find,text,input(value){find(n=>n.type==='input').props.onChange({target:{value}});render();},key(value){find(n=>n.type==='button'&&text(n)===value).props.onClick();render();},enter(){find(n=>n.type==='form').props.onSubmit({preventDefault(){}});},async settle(){await tick();render();}};
}
test('only the fourth keypad digit starts attendance, without any submit button',async()=>{
 const s=screen([{id:'piano',name:'학생 · 피아노'}]);for(const digit of ['1','2','3'])s.key(digit);assert.deepEqual(s.lookups,[]);assert.deepEqual(s.calls,[]);s.key('4');await s.settle();assert.deepEqual(s.lookups,['1234']);assert.deepEqual(s.calls,['piano']);assert.match(s.text(),/출석했어요/);assert.equal(s.find(n=>n.props?.className==='matches'),undefined);assert.equal(s.find(n=>n.type==='button'&&s.text(n)==='출석 체크'),undefined);
});
test('native input/paste also auto checks in using the complete four digits',async()=>{
 const s=screen([{id:'a',name:'학생'}]);s.input('0123');await s.settle();assert.deepEqual(s.lookups,['0123']);assert.deepEqual(s.calls,['a']);
});
test('siblings and multiple courses wait for a name/course selection',async()=>{
 for(const matches of [[{id:'a',name:'형'},{id:'b',name:'동생'}],[{id:'piano',name:'학생 · 피아노'},{id:'drum',name:'학생 · 드럼'}]]){
 const s=screen(matches);s.input('1234');await s.settle();assert.deepEqual(s.calls,[]);s.find(n=>n.type==='button'&&s.text(n).startsWith(matches[1].name)).props.onClick();await s.settle();assert.deepEqual(s.calls,[matches[1].id]);
 }
});
test('unmatched numbers never submit or loop; clearing allows a new lookup',async()=>{
 const s=screen([]);s.input('1234');await s.settle();s.key('5');s.enter();await s.settle();assert.deepEqual(s.lookups,['1234']);assert.deepEqual(s.calls,[]);assert.match(s.text(),/등록된 번호가 없어요/);s.key('지우기');s.input('5678');await s.settle();assert.deepEqual(s.lookups,['1234','5678']);
});
test('rapid input and Enter while saving cannot send a duplicate request',async()=>{
 let finish;const s=screen([{id:'a',name:'학생'}],()=>new Promise(resolve=>{finish=resolve;}));s.input('1234');s.input('5678');s.enter();await s.settle();assert.deepEqual(s.lookups,['1234']);assert.deepEqual(s.calls,['a']);assert.equal(s.find(n=>n.type==='input').props.disabled,true);finish({name:'학생'});await s.settle();assert.match(s.text(),/출석했어요/);
});
test('duplicates and save errors retain their result without automatic retry',async()=>{
 const duplicate=screen([{id:'a',name:'학생'}],async()=>({name:'학생',duplicate:true}));duplicate.input('1234');await duplicate.settle();assert.match(duplicate.text(),/이미 출석했어요/);
 const failed=screen([{id:'a',name:'학생'}],async()=>{throw Error('연결 실패');});failed.input('1234');await failed.settle();failed.render();await failed.settle();assert.match(failed.text(),/연결 실패/);assert.deepEqual(failed.calls,['a']);assert.equal(failed.find(n=>n.props?.className==='kiosk-success'),undefined);assert.equal(failed.find(n=>n.type==='input').props.disabled,false);
});
test('returning from selection and successful reset both allow the next student',async t=>{
 const multiple=screen([{id:'a',name:'형'},{id:'b',name:'동생'}]);multiple.input('1234');await multiple.settle();multiple.find(n=>n.type==='button'&&multiple.text(n)==='번호 다시 입력').props.onClick();multiple.render();assert.equal(multiple.find(n=>n.type==='input').props.value,'');multiple.input('1234');await multiple.settle();assert.equal(multiple.lookups.length,2);
 t.mock.timers.enable({apis:['setTimeout']});const s=screen([{id:'a',name:'학생'}]);s.input('1234');await s.settle();t.mock.timers.tick(3500);s.render();assert.equal(s.find(n=>n.type==='input').props.value,'');s.input('1234');await s.settle();assert.equal(s.calls.length,2);t.mock.timers.reset();
});
