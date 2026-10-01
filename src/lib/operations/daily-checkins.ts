import type { Attendance } from './model';

/** The daily arrivals list is restricted to actual, non-cancelled kiosk check-ins. */
export function dailyCheckins(rows: Attendance[], day: string): Attendance[] {
  return rows.filter(row => row.day === day && row.source === 'kiosk'
    && (!row.status || row.status === 'present' || row.status === 'makeup'));
}
