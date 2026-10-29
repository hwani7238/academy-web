import type { Attendance } from './model';

/** Actual arrivals include kiosk and teacher-confirmed arrivals, not calendar edits. */
export function dailyCheckins(rows: Attendance[], day: string): Attendance[] {
  return rows.filter(row => row.day === day && ['kiosk', 'teacher'].includes(row.source || '')
    && (!row.status || row.status === 'present' || row.status === 'makeup'));
}
