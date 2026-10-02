import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { phoneLast4 } from '../src/lib/phone.mjs';

const source = fs.readFileSync(new URL('../src/app/api/world/login/route.ts', import.meta.url), 'utf8');
function handler(records) {
    const calls = [];
    const db = { collection(name) {
        assert.equal(name, 'students');
        return {
            where(field, op, value) {
                calls.push([field, op, value]);
                return { get: async () => ({ docs: records.filter(r => r.phoneLast4 === value).map(r => ({ id: r.id, data: () => r })) }) };
            },
            doc() { return { collection(name) {
                assert.equal(name, 'logs');
                return { orderBy: () => ({ limit: () => ({ get: async () => ({ forEach() {} }) }) }) };
            } }; },
            get() { throw new Error('Full student scan is forbidden'); },
        };
    } };
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    new Function('require', 'exports', output)((name) => {
        if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
        if (name === '@/lib/firebase-admin') return { adminDb: db };
        throw new Error(name);
    }, exports);
    return { run: (digits) => exports.POST({ json: async () => ({ digits }) }), calls };
}

test('formatted phones retain leading zeros and reject missing/short values', () => {
    assert.equal(phoneLast4('010-1234-0012'), '0012');
    assert.equal(phoneLast4('010 1234 5678'), '5678');
    for (const value of [null, undefined, 1234, '', '123']) assert.equal(phoneLast4(value), null);
});
test('lookup queries only matching suffix and preserves duplicate matches', async () => {
    const { run, calls } = handler([
        { id: 'a', phone: '010-1111-0012', phoneLast4: '0012', name: 'Test A' },
        { id: 'b', phone: '010-2222-0012', phoneLast4: '0012', name: 'Test B' },
        { id: 'c', phone: '010-3333-9999', phoneLast4: '9999', name: 'Test C' },
        { id: 'stale', phone: '010-3333-9999', phoneLast4: '0012', name: 'Stale' },
    ]);
    const result = await run('0012');
    assert.deepEqual(calls, [['phoneLast4', '==', '0012']]);
    assert.deepEqual(result.body.matches.map(m => m.student.id), ['a', 'b']);
});
test('invalid input never queries Firestore', async () => {
    const { run, calls } = handler([]);
    for (const digits of ['abcd', '123', '12345', 1234, null, '12 3']) assert.equal((await run(digits)).status, 400);
    assert.deepEqual(calls, []);
});
test('no match returns empty list without scanning fallback', async () => {
    const { run } = handler([]);
    assert.deepEqual((await run('1234')).body, { ok: true, matches: [] });
});
