import { referenceOrdinal, type LessonReference } from './lesson-reference';
import {passUnitsOn,passCycleStarts,passPlanResetFrom} from './pass-history';
import type { Account, Attendance, Snapshot } from './model';
import { legacyAttendanceAppearance } from './attendance-appearance';
import { plannedLesson } from './schedule';

export type SequenceContext = {
  references?: LessonReference[];
  referenceRevision?: string;
  positions: Record<string, number>;
  missedLessons?: Record<string, string>;
  cycleFirstDays?: Record<string, string[]>;
  firstLessonTimes?: Record<string, string>;
  cycleStarts: { studentId: string; day: string }[];
};
type RecordRow = Pick<Attendance, 'studentId' | 'day' | 'units' | 'status' | 'relatedDay' | 'range'> & Partial<Pick<Attendance, 'at'>>;
type Legacy = NonNullable<Snapshot['legacyAttendance']>[number];

// Display-only chronology: neither payments nor current balances rewrite old lessons.
// Imported numbers anchor the sequence; modern records take precedence on the same day.
export function attendanceSequence(accounts: Pick<Account, 'id' | 'planUnits' | 'schedule' | 'passHistory' | 'initialPlanUnits' | 'referenceResetFrom'>[], records: RecordRow[], legacy: Legacy[], context?: SequenceContext) {
  const plans = new Map(accounts.map(a => [a.id, a]));
  const planResets = new Map(accounts.map(a => [a.id, passPlanResetFrom(a)]));
  const schedules = new Map(accounts.map(a => [a.id, a.schedule]));
  const positions = { ...context?.positions };
  const missedLessons = { ...context?.missedLessons };
  const cycleFirstDays = Object.fromEntries(Object.entries(context?.cycleFirstDays || {}).map(([id, days]) => [id, [...days]]));
  const firstLessonTimes = { ...context?.firstLessonTimes };
  const labels = new Map<string, string>();
  const makeupLinks: {key:string;studentId:string;day:string;relatedDay?:string;fallback?:string}[] = [];
  const days = new Map<string, { studentId: string; day: string; record?: RecordRow; legacy?: Legacy; reference?: LessonReference; start?: boolean }>();
  function event(studentId: string, day: string) {
    const key = `${studentId}_${day}`;
    if (!days.has(key)) days.set(key, { studentId, day });
    return days.get(key)!;
  }
  for (const r of context?.references || []) event(r.studentId, r.day).reference = r;
  for (const r of legacy) event(r.studentId, r.day).legacy = r;
  for (const r of records) event(r.studentId, r.day).record = r;
  const lastDay=[...records,...legacy,...(context?.references || [])].reduce((last,r)=>r.day>last?r.day:last,'');
  for (const r of context?.cycleStarts || passCycleStarts(accounts).filter(r=>r.day<=lastDay)) event(r.studentId, r.day).start = true;
  for (const e of [...days.values()].sort((a, b) => a.day.localeCompare(b.day))) {
    const id = e.studentId, account = plans.get(id), plan = account ? passUnitsOn(account,e.day) : undefined, key = `${id}_${e.day}`;
    const status = e.record ? (e.record.status || 'present') : (e.legacy ? legacyAttendanceAppearance(e.legacy).tone : e.reference ? legacyAttendanceAppearance(e.reference).tone : 'present');
    if (status === 'paused' || status === 'cancelled') continue;
    const missed = ['absent', 'travel', 'sick', 'late_cancel'].includes(status);
    function firstDay() {
      const dates = cycleFirstDays[id] ||= [];
      if (!dates.includes(e.day)) dates.push(e.day);
      if (e.record?.at) firstLessonTimes[key] = e.record.at;
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
    const planReset = planResets.get(id);
    const reset = Boolean((account?.referenceResetFrom && e.day >= account.referenceResetFrom) || (planReset && e.day >= planReset));
    const reference = !reset && e.reference ? referenceOrdinal(e.reference.value) : null;
    if (status === 'makeup' || status === 'makeup_reserved') {
      makeupLinks.push({ key, studentId: id, day: e.day, relatedDay: e.record?.relatedDay, fallback: reference?.label });
      continue;
    }
    if (reference) {
      // A protected range still reserves only its actual class days.
      if (missed && e.record?.range && !plannedLesson(schedules.get(id), e.day)) continue;
      positions[id] = reference.position;
      labels.set(key, reference.label);
      if (reference.first) firstDay();
      if (missed) missedLessons[key] = reference.label;
      continue;
    }
    if (e.start) positions[id] = 0;
    if (e.record) {
      // A dragged vacation range includes non-class days: reserve only scheduled
      // lessons. An individually marked absence explicitly identifies a class.
      const reserve = missed && (!e.record.range || Boolean(plannedLesson(schedules.get(id), e.day)));
      const units = Math.max(e.record.units, reserve ? 1 : 0);
      if (units <= 0) continue;
      const label = advance(units);
      labels.set(key, label);
      if (missed) missedLessons[key] = label;
    } else if (e.start) {
      // The billing form explicitly records the first lesson date, even when
      // that day's attendance has not been copied into the new system.
      positions[id] = 1;
      firstDay();
      if (missed) missedLessons[key] = '1';
      if (reset) labels.set(key, '1');
    } else if (reset && (e.legacy || e.reference)) {
      const value = referenceOrdinal((e.legacy || e.reference)!.value);
      if (value || missed) {
        const label = advance(value?.label.split('·').length || 1);
        labels.set(key, label);
        if (missed) missedLessons[key] = label;
      }
    } else if (e.legacy) {
      const value = Number(e.legacy.value);
      if (Number.isSafeInteger(value) && value > 0) { positions[id] = value; if (value === 1) firstDay(); }
      else if (missed) advance(1);
      if (missed) missedLessons[key] = String(positions[id]);
    }
  }
  for (const row of makeupLinks) {
    const original = row.relatedDay && row.relatedDay !== row.day
      ? missedLessons[`${row.studentId}_${row.relatedDay}`] : undefined;
    if (original || row.fallback) labels.set(row.key, original || row.fallback!);
  }
  return { positions, labels, missedLessons, cycleFirstDays, firstLessonTimes };
}
