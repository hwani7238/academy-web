import type { Snapshot } from './model';
import { attendanceTimeMs } from './attendance-time';
import { compareNames, compareStudents } from './student-order';

export type DailyAttendanceOrder = 'earliest' | 'latest' | 'name';
export function orderDailyAttendance(rows: Snapshot['attendance'], order: DailyAttendanceOrder) {
  const times = new Map(rows.map(row => [row.id, attendanceTimeMs(row)]));
  return [...rows].sort((a, b) => {
    if (order !== 'name') {
      const aa = times.get(a.id), bb = times.get(b.id);
      // Unknown times stay at the bottom in both directions.
      if ((aa === undefined) !== (bb === undefined)) return aa === undefined ? 1 : -1;
      if (aa !== undefined && bb !== undefined && aa !== bb) return order === 'earliest' ? aa - bb : bb - aa;
    }
    return compareNames(a.name, b.name) || a.id.localeCompare(b.id);
  });
}

export type AttendanceOrder = 'name' | 'payment';
export type Arrival = { time?: number };

export function arrivalsOnDay(data: Pick<Snapshot, 'attendance' | 'legacyAttendance'>, day: string) {
  const arrivals = new Map<string, Arrival>();
  const recorded = new Set<string>();
  for (const row of data.attendance) {
    if (row.day !== day) continue;
    recorded.add(row.studentId);
    if (row.status && row.status !== 'present' && row.status !== 'makeup') continue;
    const time = attendanceTimeMs(row);
    arrivals.set(row.studentId, time === undefined ? {} : { time });
  }
  for (const row of data.legacyAttendance || []) {
    if (row.day !== day || recorded.has(row.studentId)) continue;
    const absent = ['FFCCCCCC', 'FFD9D9D9', 'FFB7B7B7'].includes(row.color);
    if (!absent && (/^\d+(?:\.0)?$/.test(row.value.trim()) && Number(row.value) > 0 || /^(출석|보강)$/.test(row.value.trim()))) arrivals.set(row.studentId, {});
  }
  return arrivals;
}

export function orderAttendanceStudents(students: Snapshot['students'], order: AttendanceOrder, paymentDue: Set<string>) {
  return [...students].sort((a, b) => {
    if (order === 'payment' && paymentDue.has(a.id) !== paymentDue.has(b.id)) return paymentDue.has(a.id) ? -1 : 1;
    return compareStudents(a, b);
  });
}
