const fs = require('node:fs');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
function load(name, names, deps = {}) {
  const source = stripTypeScriptTypes(fs.readFileSync('src/lib/operations/' + name + '.ts', 'utf8'))
    .replace(/^import .*$/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(deps), source + ';return {' + names.join(',') + '};')(...Object.values(deps));
}
const model = load('model', ['seoulDay', 'validDay']);
const display = load('billing-display', ['invoiceCycleStart'], model);
const { attendancePaymentDue, importedAttendanceAppearance } = load('attendance-appearance', ['attendancePaymentDue', 'importedAttendanceAppearance'], {...model, ...display});
const account = { remaining: -1 };
const invoice = { status: 'open', paid: 0, amount: 180000, lessonDate: '2026-10-22', createdAt: '2026-10-10T00:00:00Z' };
const row = day => ({ day, status: 'present', units: 1 });
for (const day of ['2026-10-15', '2026-10-16', '2026-10-19']) {
  assert.equal(attendancePaymentDue(row(day), account, invoice), false, day + ' belongs to the previous paid pass');
}
assert.equal(attendancePaymentDue(row('2026-10-22'), account, invoice), true);
assert.equal(attendancePaymentDue(row('2026-10-23'), account, invoice), true);
assert.equal(attendancePaymentDue(row('2026-10-15'), account, {...invoice, cycleStart: '2026-10-15'}), false, 'linked date takes precedence');
assert.equal(attendancePaymentDue(row('2026-10-22'), account, {...invoice, status: 'paid', paid: 180000}), false);
assert.equal(attendancePaymentDue({...row('2026-10-22'), status: 'paused', units: 0}, account, invoice), false);
const unlinked = {...invoice, lessonDate: undefined};
assert.equal(attendancePaymentDue(row('2026-10-15'), account, unlinked), true, 'unlinked renewal fallback stays compatible');
assert.equal(attendancePaymentDue(row('2026-10-15'), {remaining: 3}, unlinked), false);
assert.equal(attendancePaymentDue(row('2026-10-15'), account, {...unlinked, cycleStart: '2026-10-22'}), false);
assert.equal(importedAttendanceAppearance({day:'2026-10-16',value:'10',color:''},account,invoice).tone,'present');
console.log('PASS: paid lessons before the linked first lesson are not marked unpaid; current and subsequent lessons remain due; paid, pause, legacy and unlinked renewal behavior preserved.');
