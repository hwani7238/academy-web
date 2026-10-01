import { seoulDay, validDay, type Attendance } from './model';
import { academyClosed } from './academy-calendar';
export type ScheduleRule = { start: string; weekdays: number[] };
export type LessonSchedule = { rules: ScheduleRule[]; moves: { from: string; to: string }[]; updatedAt: string };
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export function ruleOn(schedule: LessonSchedule | undefined, day: string) {
  return schedule?.rules.filter(r => r.start <= day).sort((a,b) => b.start.localeCompare(a.start))[0];
}
export function scheduleLabel(schedule: LessonSchedule | undefined, day: string) {
  const rule = ruleOn(schedule, day);
  return rule ? rule.weekdays.length ? `주 ${rule.weekdays.length}회 · ${WEEK_ORDER.filter(n=>rule.weekdays.includes(n)).map(n=>WEEKDAYS[n]).join('·')}` : '정규 수업 없음' : '요일 설정';
}
export function scheduleSummary(schedule: LessonSchedule | undefined, today: string) {
  const upcoming = (schedule?.rules || []).filter(r => r.start > today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(r => ({ start: r.start, label: scheduleLabel(schedule, r.start) }));
  return { label: ruleOn(schedule, today) ? scheduleLabel(schedule, today) : upcoming.length ? '적용 예정' : '요일 설정', upcoming };
}
export function plannedLesson(schedule: LessonSchedule | undefined, day: string): { origin: string; moved: boolean } | null {
  if (!schedule || academyClosed(day)) return null;
  const moved = schedule.moves.find(m=>m.to===day);
  if (moved) return { origin: moved.from, moved: true };
  if (schedule.moves.some(m=>m.from===day)) return null;
  return ruleOn(schedule, day)?.weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ? { origin: day, moved: false } : null;
}
// Effective-dated rules preserve earlier schedules. One-off moves take priority over recurring rules.
export function changeSchedule(old: LessonSchedule | undefined, input: Record<string,unknown>, stamp: string, today=seoulDay()): LessonSchedule {
  if ((old?.updatedAt || '') !== (input.expectedUpdatedAt || '')) throw Error('수업 일정이 변경됐습니다. 창을 닫고 다시 열어주세요.');
  const start=validDay(input.start);
  if (start<today) throw Error('적용 시작일은 오늘 이후로 선택해주세요. 지난 일정은 유지됩니다.');
  let rules=(old?.rules || []).filter(r=>r.start!==start);
  if (input.remove !== true) {
    if (!Array.isArray(input.weekdays) || input.weekdays.length>7 || input.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)) throw Error('수업 요일을 확인해주세요.');
    rules=[...rules,{start,weekdays:WEEK_ORDER.filter(n=>(input.weekdays as number[]).includes(n))}];
  } else if (!old?.rules.some(r=>r.start===start)) throw Error('변경할 일정이 없습니다.');
  return {rules:rules.sort((a,b)=>a.start.localeCompare(b.start)),moves:old?.moves || [],updatedAt:stamp};
}
export function moveLesson(old: LessonSchedule | undefined, input: Record<string,unknown>, records: Attendance[], stamp: string, today=seoulDay()): LessonSchedule {
  if (!old || old.updatedAt!==input.expectedUpdatedAt) throw Error('수업 일정이 변경됐습니다. 창을 닫고 다시 열어주세요.');
  const from=validDay(input.from),to=validDay(input.to);
  if (from<today || to<today) throw Error('오늘 이후 수업만 옮길 수 있습니다.');
  if (from===to) throw Error('옮길 날짜를 다르게 선택해주세요.');
  if (academyClosed(to)) throw Error('학원 휴원일에는 수업을 옮길 수 없습니다. 다른 날짜를 선택해주세요.');
  const lesson=plannedLesson(old,from);
  if (!lesson) throw Error('옮길 수업이 없습니다.');
  if (plannedLesson(old,to)) throw Error('그 날짜에는 이미 수업이 예정되어 있습니다. 다른 날짜를 선택해주세요.');
  if (records.some(r=>r.day===from && (r.units>0 || ['present','makeup','makeup_reserved'].includes(r.status||'present')))) throw Error('출석·보강 예약·차감 기록이 있는 수업은 옮길 수 없습니다.');
  if (records.some(r=>r.day===to && r.status!=='cancelled')) throw Error('옮길 날짜에 출결·여행 기록이 있습니다. 다른 날짜를 선택하거나 해당 기록을 먼저 취소해주세요.');
  const moves=old.moves.filter(m=>m.from!==lesson.origin);
  const originIsRegular=ruleOn(old,lesson.origin)?.weekdays.includes(new Date(`${lesson.origin}T00:00:00Z`).getUTCDay());
  if (to!==lesson.origin || !originIsRegular) moves.push({from:lesson.origin,to});
  return {...old,moves,updatedAt:stamp};
}
