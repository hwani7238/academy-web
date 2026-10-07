import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
test('source cache coalesces requests, invalidates, and retries failures',async()=>{
 let calls=0;let fail=false;
 const db={collection:()=>({select:()=>({get:async()=>{calls++;if(fail)throw Error('offline');return {version:calls};}})})};
 const exports={};const code=ts.transpileModule(fs.readFileSync('src/lib/operations/import-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',code)(()=>({database:()=>db}),exports);
 const [a,b]=await Promise.all([exports.importSources(),exports.importSources()]);assert.equal(calls,1);assert.equal(a,b);
 await exports.importSources();assert.equal(calls,1);
 exports.invalidateImportCache();await exports.importSources();assert.equal(calls,2);
 exports.invalidateImportCache();fail=true;await assert.rejects(exports.importSources());fail=false;
 await exports.importSources();assert.equal(calls,4);
});
