import type { Snapshot } from './model';
import { attendanceTimeMs } from './attendance-time';
import { compareStudents } from './student-order';

export type AttendanceOrder = 'name' | 'attendance';
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

export function orderAttendanceStudents(students: Snapshot['students'], order: AttendanceOrder, arrivals: Map<string, Arrival>) {
  return [...students].sort((a, b) => {
    if (order === 'attendance') {
      const aa = arrivals.get(a.id), bb = arrivals.get(b.id);
      if (Boolean(aa) !== Boolean(bb)) return aa ? -1 : 1;
      if (aa && bb) {
        if ((aa.time !== undefined) !== (bb.time !== undefined)) return aa.time !== undefined ? -1 : 1;
        if (aa.time !== undefined && bb.time !== undefined && aa.time !== bb.time) return aa.time - bb.time;
      }
    }
    return compareStudents(a, b);
  });
}

export function arrivalLabel(arrival: Arrival) {
  return arrival.time === undefined ? '출석 · 시간 미기록' : `출석 ${new Date(arrival.time).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
