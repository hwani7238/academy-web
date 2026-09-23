import type { Snapshot, Attendance, Account, Invoice } from './model';
import type { Lifecycle } from './lifecycle';
export type SnapshotChanges = { lifecycle?: { sourceStudentId: string; value: Lifecycle }; attendance?: Attendance[]; accounts?: Account[]; invoices?: Invoice[] };
function merge<T extends {id:string}>(old:T[], changed:T[] = []) {
  const updates = new Map(changed.map(row=>[row.id,row]));
  return [...old.filter(row=>!updates.has(row.id)), ...changed];
}
// Apply only server-confirmed records, keeping the currently selected month intact.
export function applySnapshotChanges(current: Snapshot, changes: SnapshotChanges): Snapshot {
  const life = changes.lifecycle;
  return { ...current,
    students: life ? current.students.map(s=>(s.sourceStudentId||s.id)===life.sourceStudentId ? {...s,lifecycle:life.value} : s) : current.students,
    attendance: merge(current.attendance, changes.attendance?.filter(a=>a.day.slice(0,7)===current.day.slice(0,7))),
    accounts: merge(current.accounts, changes.accounts),
    invoices: merge(current.invoices, changes.invoices).filter(i=>i.status==='open'),
  };
}
