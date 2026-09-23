import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const calendar = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/operations/holidays.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(calendar);
test('Saturday, Sunday and holiday precedence use date-only Korean calendar days',()=>{
 assert.equal(calendar.calendarDay('2026-09-19').className,'calendar-saturday');
 assert.equal(calendar.calendarDay('2026-09-20').className,'calendar-holiday');
 for(const day of ['2026-09-24','2026-09-25','2026-09-26'])assert.equal(calendar.calendarDay(day).className,'calendar-holiday');
 assert.equal(calendar.calendarDay('2026-09-28').className,'');
 assert.equal(calendar.calendarDay('2026-10-05').holiday,'대체공휴일(개천절)');
});
test('historical exceptions and year-specific holidays remain accurate',()=>{
 for(const day of ['2023-05-29','2023-10-02','2024-10-01','2025-01-27','2025-06-03'])assert.ok(calendar.calendarDay(day).holiday);
 assert.equal(calendar.calendarDay('2025-07-17').holiday,undefined);
 assert.equal(calendar.calendarDay('2026-07-17').holiday,'제헌절');
 for(const day of Object.keys(calendar.HOLIDAYS))assert.equal(new Date(day).toISOString().slice(0,10),day);
});
