import { config } from 'dotenv';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { phoneLast4 } from '../src/lib/phone.mjs';

config({ path: '.env.local', quiet: true });
const apply = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
initializeApp({ projectId, credential: privateKey && clientEmail
    ? cert({ projectId, privateKey, clientEmail }) : applicationDefault() });
const db = getFirestore();

// This one-time scan is intentional. Ordinary lookups never scan all students.
// Transactions re-read the phone to avoid overwriting a concurrent phone edit.
const students = await db.collection('students').get();
let changed = 0;
let invalid = 0;
for (const student of students.docs) {
    const inspect = (data) => {
        const suffix = phoneLast4(data.phone);
        return { suffix, changed: data.phoneLast4 !== suffix };
    };
    const result = apply ? await db.runTransaction(async (transaction) => {
        const current = await transaction.get(student.ref);
        if (!current.exists) return null;
        const result = inspect(current.data());
        if (result.changed) transaction.update(student.ref, { phoneLast4: result.suffix });
        return result;
    }) : inspect(student.data());
    if (!result) continue;
    if (result.changed) changed++;
    if (result.suffix === null) invalid++;
}
console.log(JSON.stringify({ projectId, mode: apply ? 'apply' : 'dry-run', scanned: students.size, changed, invalid }));
await db.terminate();
