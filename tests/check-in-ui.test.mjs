import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const code = ts.transpileModule(fs.readFileSync('src/components/operations/CheckIn.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick = () => new Promise(resolve=>setImmediate(resolve));
function screen(matches, save = async id=>({name:id})) {
  const state=[];let cursor=0,tree;const calls=[];
  const hooks={useEffect(){},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(initial){const i=cursor++;return state[i]??=( {current:initial} );}};
  const exports={};new Function('require','exports',code)(id=>id==='react'?hooks:id.endsWith('.css')?{}:require(id),exports);
  const render=()=>{cursor=0;tree=exports.CheckIn({demo:{lookup:()=>matches,checkIn:async id=>{calls.push(id);return save(id);}}});};
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return [node,...nodes(node.props?.children ?? null)];}
  const find=predicate=>nodes().find(predicate);
  const text=(node=tree)=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children ?? null):'';
  render();find(n=>n.type==='input').props.onChange({target:{value:'1234'}});render();
  return {calls,render,find,text,submit(){find(n=>n.type==='form').props.onSubmit({preventDefault(){}});},async settle(){await tick();render();}};
}
test('one matching course checks in immediately without an extra name click',async()=>{
 const s=screen([{id:'piano',name:'학생 · 피아노'}]);s.submit();await s.settle();assert.deepEqual(s.calls,['piano']);assert.match(s.text(),/출석했어요/);assert.equal(s.find(n=>n.props?.className==='matches'),undefined);
});
test('siblings, matching phone suffixes and multiple courses require explicit selection',async()=>{
 for(const matches of [[{id:'a',name:'형'},{id:'b',name:'동생'}],[{id:'piano',name:'학생 · 피아노'},{id:'drum',name:'학생 · 드럼'}]]){
 const s=screen(matches);s.submit();await s.settle();assert.deepEqual(s.calls,[]);s.find(n=>n.type==='button'&&s.text(n).startsWith(matches[1].name)).props.onClick();await s.settle();assert.deepEqual(s.calls,[matches[1].id]);
 }
});
test('unmatched digits never write attendance',async()=>{
 const s=screen([]);s.submit();await s.settle();assert.deepEqual(s.calls,[]);assert.match(s.text(),/등록된 번호가 없어요/);
});
test('repeated submit while saving cannot create a second request',async()=>{
 let finish;const s=screen([{id:'a',name:'학생'}],()=>new Promise(resolve=>{finish=resolve;}));s.submit();s.submit();await s.settle();assert.deepEqual(s.calls,['a']);assert.equal(s.find(n=>n.type==='input').props.disabled,true);finish({name:'학생'});await s.settle();assert.match(s.text(),/출석했어요/);
});
test('existing attendance shows duplicate result and failures do not show success',async()=>{
 const duplicate=screen([{id:'a',name:'학생'}],async()=>({name:'학생',duplicate:true}));duplicate.submit();await duplicate.settle();assert.match(duplicate.text(),/이미 출석했어요/);
 const failed=screen([{id:'a',name:'학생'}],async()=>{throw Error('연결 실패');});failed.submit();await failed.settle();assert.match(failed.text(),/연결 실패/);assert.equal(failed.find(n=>n.props?.className==='kiosk-success'),undefined);assert.equal(failed.find(n=>n.type==='input').props.disabled,false);
});
