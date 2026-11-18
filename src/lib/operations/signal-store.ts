import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction, WriteBatch, DocumentReference } from 'firebase-admin/firestore';

type Topic = 'operations' | 'integrity';
const collections = new Set(['students', 'opsAccounts', 'opsAttendance', 'opsInvoices', 'opsPayments', 'opsNotices', 'opsImports', 'opsLessonReferences', 'opsLegacyCorrections', 'opsCourseLedgers', 'opsLedgerSources']);
const stores = new WeakMap<Firestore, Firestore>();

function topicFor(ref: DocumentReference, kind: string, data?: unknown): Topic | undefined {
  const [collection, id, child] = ref.path.split('/');
  if (child) return; // Feedback/media edits do not invalidate the operations ledger.
  if (collection === 'opsIntegrityStatus' && id === 'latest') return 'integrity';
  if (collections.has(collection)) return 'operations';
  // Kiosk rate-limit counters change on every key lookup, not on attendance.
  if (collection === 'opsDevices' && (kind !== 'update' || typeof data !== 'object' || data === null || Object.keys(data).some(key => !['requests', 'windowStart'].includes(key)))) return 'operations';
}

/** Commit a content-free invalidation in the SAME transaction/batch as the data.
 * No background function, database scan, or persistent Vercel connection.
 * Each retry gets its own topic set; aborted writes never notify clients.
 * Query snapshots keep raw refs: write them through a tracked batch/transaction
 * or db.doc(snapshot.ref.path), never snapshot.ref.update() directly. */
export function signalDatabase(db: Firestore): Firestore {
  const cached = stores.get(db);
  if (cached) return cached;
  function writer<T extends Transaction | WriteBatch>(raw: T) {
    const topics = new Set<Topic>();
    const flush = () => {
      for (const topic of topics) Reflect.apply(raw.set, raw, [db.doc(`opsSignals/${topic}`), { revision: randomUUID() }]);
      topics.clear();
    };
    const proxy = new Proxy(raw, {
      get(target, key) {
        if (['create', 'set', 'update', 'delete'].includes(String(key))) return (...args: unknown[]) => {
          const topic = topicFor(args[0] as DocumentReference, String(key), args[1]);
          if (topic) topics.add(topic);
          Reflect.apply(Reflect.get(target, key) as (...values: unknown[]) => unknown, target, args);
          return proxy;
        };
        if (key === 'commit') return () => { flush(); return (raw as WriteBatch).commit(); };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { proxy, flush };
  }
  const proxy = new Proxy(db, {
    get(target, key) {
      if (key === 'runTransaction') return (work: (tx: Transaction) => Promise<unknown>, options?: FirebaseFirestore.ReadWriteTransactionOptions) => target.runTransaction(async tx => {
        const tracked = writer(tx);
        const result = await work(tracked.proxy);
        tracked.flush();
        return result;
      }, options);
      if (key === 'batch') return () => writer(target.batch()).proxy;
      if (key === 'doc') return (path: string) => {
        const ref = target.doc(path);
        return new Proxy(ref, { get(doc, method) {
          if (['create', 'set', 'update', 'delete'].includes(String(method))) return async (...args: unknown[]) => {
            const batch = writer(target.batch()).proxy;
            Reflect.apply(Reflect.get(batch, method), batch, [ref, ...args]);
            return (await batch.commit())[0];
          };
          const value = Reflect.get(doc, method);
          return typeof value === 'function' ? value.bind(doc) : value;
        } });
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  stores.set(db, proxy);
  return proxy;
}
