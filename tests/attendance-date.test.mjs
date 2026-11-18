import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/attendance-date.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
test('day navigation handles month/year boundaries, leap days and Korean weekday labels',()=>{
 const {shiftAttendanceDay:shift,attendanceDayLabel:label,validAttendanceDay:valid}=exports;
 assert.equal(shift('2026-11-01',-1),'2026-10-31');assert.equal(shift('2026-12-31',1),'2027-01-01');assert.equal(shift('2028-03-01',-1),'2028-02-29');assert.equal(shift('2026-03-01',-1),'2026-02-28');assert.equal(label('2026-11-18'),'2026-11-18 (수)');
 for(const d of ['2026-02-29','2026-02-30','2026-00-01','2026-01-32','2026-11-18T00:00:00Z'])assert.throws(()=>valid(d));
});
