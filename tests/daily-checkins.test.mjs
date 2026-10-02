import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exported = {};
const code = ts.transpileModule(fs.readFileSync('src/lib/operations/daily-checkins.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
new Function('exports', code)(exported);
const { dailyCheckins } = exported;

test('daily arrivals exclude pre-entered leave, manual attendance and cancelled check-ins', () => {
  const day = '2026-10-01';
  const row = (id, source, status, units = 1) => ({id, day, source, status, units});
  const rows = [row('travel', 'manual', 'travel', 0), row('absent', 'manual', 'absent', 0),
    row('manual-present', 'manual', 'present'), row('manual-makeup', 'manual', 'makeup'),
    row('unknown-origin', undefined, 'present'), row('kiosk', 'kiosk', 'present'),
    row('adjusted-kiosk', 'kiosk', 'makeup', 0), row('cancelled-kiosk', 'kiosk', 'cancelled', 0),
    row('sick-kiosk', 'kiosk', 'sick', 0), row('late-cancel', 'kiosk', 'late_cancel'),
    {...row('yesterday', 'kiosk', 'present'), day: '2026-09-30'}];
  const before = structuredClone(rows);
  assert.deepEqual(dailyCheckins(rows, day).map(r => r.id), ['kiosk', 'adjusted-kiosk']);
  assert.deepEqual(rows, before);
  assert.deepEqual(dailyCheckins(rows.slice(0, 5), day), []);
  // A manual time edit does not turn a manual record into a kiosk arrival.
  assert.deepEqual(dailyCheckins([{...rows[2], arrivalAt: `${day}T05:00:00Z`}], day), []);
  assert.equal(dailyCheckins([row('older-kiosk', 'kiosk', undefined)], day).length, 1);
});
