import { hash } from './auth';

// Read before the snapshot so changes made during loading are seen by the next poll.
// A schedule edit does not create an attendance record; include it independently.
export async function operationsRevision(db: FirebaseFirestore.Firestore) {
  const snapshots = await Promise.all([
    db.collection('opsAttendance').orderBy('updatedAt', 'desc').limit(1).select('updatedAt').get(),
    db.collection('opsAccounts').orderBy('schedule.updatedAt', 'desc').limit(1).select('schedule.updatedAt').get(),
  ]);
  return hash(JSON.stringify(snapshots.map(snap => snap.docs.map(d => [d.id, d.data(), d.updateTime]))));
}
