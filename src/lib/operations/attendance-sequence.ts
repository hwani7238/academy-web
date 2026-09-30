import type { Account, Attendance, Snapshot } from './model';

export type SequenceContext = {
  positions: Record<string, number>;
  cycleStarts: { studentId: string; day: string }[];
};
type RecordRow = Pick<Attendance, 'studentId' | 'day' | 'units' | 'status'>;
type Legacy = NonNullable<Snapshot['legacyAttendance']>[number];

// Display-only chronology: neither payments nor current balances rewrite old lessons.
// Imported numbers anchor the sequence; modern records take precedence on the same day.
export function attendanceSequence(accounts: Pick<Account, 'id' | 'planUnits'>[], records: RecordRow[], legacy: Legacy[], context?: SequenceContext) {
  const plans = new Map(accounts.map(a => [a.id, a.planUnits]));
  const positions = { ...context?.positions };
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
    const id = e.studentId, plan = plans.get(id);
    if (e.start) positions[id] = 0;
    if (e.record) {
      if (e.record.status === 'cancelled' || e.record.units <= 0) continue;
      const numbers: number[] = [];
      for (let n = 0; n < e.record.units; n++) {
        const last = positions[id] || 0;
        positions[id] = plan && plan > 0 ? (last % plan) + 1 : last + 1;
        numbers.push(positions[id]);
      }
      labels.set(`${id}_${e.day}`, numbers.join('·'));
    } else if (e.start) {
      // The billing form explicitly records the first lesson date, even when
      // that day's attendance has not been copied into the new system.
      positions[id] = 1;
    } else if (e.legacy && !['FFCCCCCC', 'FFD9D9D9', 'FFB7B7B7'].includes(e.legacy.color)) {
      const value = Number(e.legacy.value);
      if (Number.isSafeInteger(value) && value > 0) positions[id] = value;
    }
  }
  return { positions, labels };
}
