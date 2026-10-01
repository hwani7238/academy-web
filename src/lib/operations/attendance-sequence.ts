import type { Account, Attendance, Snapshot } from './model';
import { legacyAttendanceAppearance } from './attendance-appearance';
import { plannedLesson } from './schedule';

export type SequenceContext = {
  positions: Record<string, number>;
  missedLessons?: Record<string, string>;
  cycleFirstDays?: Record<string, string[]>;
  cycleStarts: { studentId: string; day: string }[];
};
type RecordRow = Pick<Attendance, 'studentId' | 'day' | 'units' | 'status' | 'relatedDay' | 'range'>;
type Legacy = NonNullable<Snapshot['legacyAttendance']>[number];

// Display-only chronology: neither payments nor current balances rewrite old lessons.
// Imported numbers anchor the sequence; modern records take precedence on the same day.
export function attendanceSequence(accounts: Pick<Account, 'id' | 'planUnits' | 'schedule'>[], records: RecordRow[], legacy: Legacy[], context?: SequenceContext) {
  const plans = new Map(accounts.map(a => [a.id, a.planUnits]));
  const schedules = new Map(accounts.map(a => [a.id, a.schedule]));
  const positions = { ...context?.positions };
  const missedLessons = { ...context?.missedLessons };
  const cycleFirstDays = Object.fromEntries(Object.entries(context?.cycleFirstDays || {}).map(([id, days]) => [id, [...days]]));
  const labels = new Map<string, string>();
  const days = new Map<string, { studentId: string; day: string; record?: RecordRow; legacy?: Legacy; start?: boolean }>();
  function event(studentId: string, day: string) {
    const key = `${studentId}_${day}`;
    if (!days.has(key)) days.set(key, { studentId, day });
    return days.get(key)!;
  }
  for (const r of legacy) event(r.studentId, r.day).legacy = r;
  for (const r of records) event(r.studentId, r.day).record = r;
  for (const r of context?.cycleStarts || []) event(r.studentId, r.day).start = true;
  for (const e of [...days.values()].sort((a, b) => a.day.localeCompare(b.day))) {
    const id = e.studentId, plan = plans.get(id), key = `${id}_${e.day}`;
    const status = e.record ? (e.record.status || 'present') : (e.legacy ? legacyAttendanceAppearance(e.legacy).tone : 'present');
    const missed = ['absent', 'travel', 'sick', 'late_cancel'].includes(status);
    function firstDay() {
      const dates = cycleFirstDays[id] ||= [];
      if (!dates.includes(e.day)) dates.push(e.day);
    }
    function advance(units: number) {
      const numbers: number[] = [];
      for (let n = 0; n < units; n++) {
        const last = positions[id] || 0;
        positions[id] = plan && plan > 0 ? (last % plan) + 1 : last + 1;
        numbers.push(positions[id]);
        if (positions[id] === 1) firstDay();
      }
      return numbers.join('·');
    }
    if (e.start) positions[id] = 0;
    if (e.record) {
      if (status === 'cancelled') continue;
      if (status === 'makeup' || status === 'makeup_reserved') {
        // Makeup fills the original slot, even in a later month or pass.
        // Unlinked makeup has no guessed ordinal and never shifts regular lessons.
        const original = e.record.relatedDay && e.record.relatedDay < e.day
          ? missedLessons[`${id}_${e.record.relatedDay}`] : undefined;
        if (original) labels.set(key, original);
        continue;
      }
      // A dragged vacation range includes non-class days: reserve only scheduled
      // lessons. An individually marked absence explicitly identifies a class.
      const reserve = missed && (!e.record.range || Boolean(plannedLesson(schedules.get(id), e.day)));
      const units = Math.max(e.record.units, reserve ? 1 : 0);
      if (units <= 0) continue;
      const label = advance(units);
      labels.set(key, label);
      if (missed) missedLessons[key] = label;
    } else if (status === 'cancelled' || status === 'makeup') {
      continue;
    } else if (e.start) {
      // The billing form explicitly records the first lesson date, even when
      // that day's attendance has not been copied into the new system.
      positions[id] = 1;
      firstDay();
      if (missed) missedLessons[key] = '1';
    } else if (e.legacy) {
      const value = Number(e.legacy.value);
      if (Number.isSafeInteger(value) && value > 0) { positions[id] = value; if (value === 1) firstDay(); }
      else if (missed) advance(1);
      if (missed) missedLessons[key] = String(positions[id]);
    }
  }
  return { positions, labels, missedLessons, cycleFirstDays };
}
