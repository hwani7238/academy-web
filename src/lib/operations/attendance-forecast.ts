import { attendanceSequence } from './attendance-sequence';
import type { Account, Attendance, Snapshot } from './model';
import { plannedLesson } from './schedule';

// Preview only: projected lessons never enter the attendance ledger or balance.
export function attendanceForecastSequence(
  accounts: Account[], records: Attendance[], legacy: NonNullable<Snapshot['legacyAttendance']>,
  context: Snapshot['sequenceContext'], dates: string[], today: string,
) {
  const occupied = new Set([...records, ...legacy, ...(context?.references || [])].map(row => `${row.studentId}_${row.day}`));
  const projected: Pick<Attendance, 'studentId' | 'day' | 'units' | 'status'>[] = [];
  for (const account of accounts) {
    if (!account.active || !account.schedule) continue;
    for (const day of dates) {
      if (day < '2026-10-01' || day < today || occupied.has(`${account.id}_${day}`) || !plannedLesson(account.schedule, day)) continue;
      projected.push({ studentId: account.id, day, units: 1, status: 'present' });
    }
  }
  const sequence = attendanceSequence(accounts, [...records, ...projected], legacy, context);
  const forecast = new Map(projected.map(row => {
    const key = `${row.studentId}_${row.day}`;
    return [key, sequence.labels.get(key)!];
  }));
  // Explicit future ledger dates are also previews, including dates which differ
  // from the regular weekly timetable. Keep billing previews on the same dates.
  const recorded = new Set([...records, ...legacy].map(row => `${row.studentId}_${row.day}`));
  const visibleDates = new Set(dates);
  for (const row of context?.references || []) {
    const key = `${row.studentId}_${row.day}`, label = sequence.labels.get(key);
    if (row.day >= today && visibleDates.has(row.day) && !recorded.has(key) && row.color !== '#FF9900' && label) forecast.set(key, label);
  }
  return { sequence, forecast };
}

export function attendanceForecast(
  ...args: Parameters<typeof attendanceForecastSequence>
) {
  return attendanceForecastSequence(...args).forecast;
}
