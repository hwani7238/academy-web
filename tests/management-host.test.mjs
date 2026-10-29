import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const loaded = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/operations/management-host.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(loaded.exports);
const { managementRoute } = loaded.exports;
test('manage cannot serve the general teacher dashboard or alternate page entrances', () => {
  for (const path of ['/', '/admin', '/teacher/attendance', '/setup-admin', '/teacher-signup', '/operations/demo', '/demo', '/report/student/log', '/operations/']) assert.equal(managementRoute('manage.wheemusic.com', path), 'redirect');
  for (const path of ['/api/feedback/student/log', '/api/send-alimtalk', '/api/teacher/attendance/other', '/api/world/login', '/api/report/student/log']) assert.equal(managementRoute('manage.wheemusic.com', path), 'deny-api');
});
test('existing owner APIs, authenticated kiosks and public website remain available', () => {
  for (const path of ['/login', '/operations', '/api/teacher/attendance', '/api/operations', '/api/operations/access', '/api/operations/payments', '/api/check-in', '/check-in', '/api/cron/send-notifications', '/_next/static/file.js', '/favicon.ico']) assert.equal(managementRoute('manage.wheemusic.com', path), 'allow');
  for (const host of ['wheemusic.com', 'www.wheemusic.com', 'localhost']) for (const path of ['/admin', '/teacher/attendance', '/api/feedback/student/log']) assert.equal(managementRoute(host, path), 'allow');
});
