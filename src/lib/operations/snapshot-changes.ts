import type { Snapshot, Attendance, Account, Invoice } from './model';
import type { Lifecycle } from './lifecycle';
export type SnapshotChanges = { contact?: { sourceStudentId: string; phone: string; phoneUpdatedAt: string }; lifecycle?: { studentId: string; value: Lifecycle }; attendance?: Attendance[]; accounts?: Account[]; invoices?: Invoice[] };
function merge<T extends {id:string}>(old:T[], changed:T[] = []) {
  if (!changed.length) return old;
  const updates = new Map(changed.map(row=>[row.id,row]));
  return [...old.filter(row=>!updates.has(row.id)), ...changed];
}
// Apply only server-confirmed records, keeping the currently selected month intact.
export function applySnapshotChanges(current: Snapshot, changes: SnapshotChanges): Snapshot {
  const life = changes.lifecycle;
  const contact = changes.contact;
  return { ...current,
    students: life || contact ? current.students.map(s => ({ ...s,
      ...(life && s.id === life.studentId ? { lifecycle: life.value } : {}),
      ...(contact && (s.sourceStudentId || s.id) === contact.sourceStudentId ? { phone: contact.phone, phoneUpdatedAt: contact.phoneUpdatedAt } : {}),
    })) : current.students,
    attendance: merge(current.attendance, changes.attendance?.filter(a=>a.day.slice(0,7)===current.day.slice(0,7))),
    accounts: merge(current.accounts, changes.accounts),
    invoices: merge(current.invoices, changes.invoices).filter(i=>i.status==='open'),
  };
}

// Preserve unchanged sections across polls: a notice update should not rebuild
// thousands of calendar cells or reset memoized attendance calculations.
export function reconcileSnapshot(current: Snapshot | null, next: Snapshot): Snapshot {
  if (!current) return next;
  let changed = false;
  const result = { ...next };
  for (const key of Object.keys(next) as (keyof Snapshot)[]) {
    if (JSON.stringify(current[key]) === JSON.stringify(next[key])) {
      Object.assign(result, { [key]: current[key] });
    } else { changed = true; }
  }
  return changed || Object.keys(current).length !== Object.keys(next).length ? result : current;
}
