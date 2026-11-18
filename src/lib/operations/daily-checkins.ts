import type { Attendance } from './model';

/** Completed attendance includes owner-entered calendar attendance; leave and reservations do not. */
export function dailyCheckins(rows: Attendance[], day: string): Attendance[] {
  return rows.filter(row => row.day === day && ['kiosk', 'teacher', 'manual'].includes(row.source || '')
    && (!row.status || row.status === 'present' || row.status === 'makeup'));
}
