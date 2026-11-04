import { attendanceSequence } from './attendance-sequence';
import type { Account, Attendance, Snapshot } from './model';
import { plannedLesson } from './schedule';
import { legacyAttendanceAppearance } from './attendance-appearance';
import { passCycleStarts } from './pass-history';

// Preview only: projected lessons never enter the attendance ledger or balance.
export function attendanceForecastSequence(
  accounts: Account[], records: Attendance[], legacy: NonNullable<Snapshot['legacyAttendance']>,
  context: Snapshot['sequenceContext'], dates: string[], today: string,
) {
  const occupied = new Set([...records, ...legacy.filter(r=>!context?.canonical?.[r.studentId]||r.day<context.canonical[r.studentId].seed.from), ...(context?.references || []).filter(r=>!context?.canonical?.[r.studentId])].map(row => `${row.studentId}_${row.day}`));
  const projected: Pick<Attendance, 'studentId' | 'day' | 'units' | 'status'>[] = [];
  for (const account of accounts) {
    if (!account.active || !account.schedule) continue;
    // Include the unseen portion of a pending pass when viewing a later month.
    const previewDates = new Set(dates);
    if ((account.nextPass || account.ledgerVersion===2) && dates.length) {
      const last = [...dates].sort().at(-1)!;
      for (let t = Date.parse(today); t <= Date.parse(last); t += 86400000) previewDates.add(new Date(t).toISOString().slice(0, 10));
    }
    for (const day of [...previewDates].sort()) {
      if (day < '2026-10-01' || day < today || occupied.has(`${account.id}_${day}`) || !plannedLesson(account.schedule, day)) continue;
      projected.push({ studentId: account.id, day, units: 1, status: 'present' });
    }
  }
  const recorded = new Set([...records, ...legacy].map(row => `${row.studentId}_${row.day}`));
  const previews = [...projected, ...(context?.references || []).filter(row =>
    !context?.canonical?.[row.studentId] && row.day >= today && !recorded.has(`${row.studentId}_${row.day}`) &&
    ['present', 'payment-due'].includes(legacyAttendanceAppearance(row).tone)
  ).map(row => ({studentId:row.studentId,day:row.day,units:1,status:'present' as const}))];
  const starts: {studentId:string;day:string}[] = [];
  const previewAccounts = accounts.map(account => {
    const next = account.nextPass;
    if (!account.active || !next) return account;
    let remaining = account.remaining;
    const start = previews.filter(row => row.studentId === account.id).sort((a,b) => a.day.localeCompare(b.day)).find(row => {
      const due = next.mode === 'date' ? row.day >= next.start : row.day >= next.reservedOn && remaining <= 0;
      remaining -= row.units;
      return due;
    })?.day;
    if (!start) return account;
    starts.push({studentId:account.id,day:start});
    return {...account, initialPlanUnits:account.initialPlanUnits || account.planUnits,
      referenceResetFrom:account.referenceResetFrom && account.referenceResetFrom < start ? account.referenceResetFrom : start,
      passHistory:[...(account.passHistory || []).filter(row => row.start !== start), {start,units:next.units}].sort((a,b) => a.start.localeCompare(b.start))};
  });
  const sequence = attendanceSequence(previewAccounts, [...records, ...projected], legacy, starts.length ? {
    ...context, positions:context?.positions || {}, cycleStarts:[...(context?.cycleStarts || passCycleStarts(accounts)), ...starts],
  } : context);
  const visibleDates = new Set(dates);
  const forecast = new Map(projected.filter(row => visibleDates.has(row.day)).map(row => {
    const key = `${row.studentId}_${row.day}`;
    return [key, sequence.labels.get(key)!];
  }));
  // Explicit future ledger dates are also previews, including dates which differ
  // from the regular weekly timetable. Keep billing previews on the same dates.
  for (const row of context?.references || []) {
    const key = `${row.studentId}_${row.day}`, label = sequence.labels.get(key);
    if (!context?.canonical?.[row.studentId] && row.day >= today && visibleDates.has(row.day) && !recorded.has(key) && row.color !== '#FF9900' && label) forecast.set(key, label);
  }
  return { sequence, forecast };
}

export function attendanceForecast(
  ...args: Parameters<typeof attendanceForecastSequence>
) {
  return attendanceForecastSequence(...args).forecast;
}
