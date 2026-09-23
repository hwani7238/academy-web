import { database } from './auth';
// Only immutable import source documents are cached. Balances and attendance stay fresh.
let cached: { expires: number; value: FirebaseFirestore.QuerySnapshot } | undefined;
let pending: Promise<FirebaseFirestore.QuerySnapshot> | undefined;
export function invalidateImportCache() { cached = undefined; pending = undefined; }
export async function importSources() {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  const request = database().collection('opsImports').select('matchedStudentId', 'subject', 'asOf', 'history').get();
  pending = request;
  try {
    const value = await request;
    if (pending === request) cached = { expires: Date.now() + 300000, value };
    return value;
  } finally { if (pending === request) pending = undefined; }
}
