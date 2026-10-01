import { validDay, type Attendance } from './model';

export const RANGE_STATUSES = ['travel', 'absent', 'sick'] as const;
export function attendanceDays(start: unknown, end: unknown) {
  const from = validDay(start), to = validDay(end);
  const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (count < 1 || count > 92) throw Error('시작일과 종료일을 확인해주세요. 한 번에 최대 92일까지 선택할 수 있습니다.');
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10));
}
export function rangeAttendance(input: Record<string, unknown>, student: {id:string;name:string}, previous: Attendance[], legacyDays: Set<string>, stamp: string) {
  const days = attendanceDays(input.start, input.end), cancel = input.status === 'cancelled';
  if (!cancel && !RANGE_STATUSES.includes(input.status as typeof RANGE_STATUSES[number])) throw Error('여행·결석·병가 중 선택해주세요.');
  if (typeof input.rangeId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(input.rangeId)) throw Error('기간 정보를 다시 열어주세요.');
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const revisions = (input.revisions && typeof input.revisions === 'object' ? input.revisions : {}) as Record<string,string>;
  const oldByDay = new Map(previous.map(r=>[r.day,r]));
  const changes: Attendance[] = [];
  for (const day of days) {
    const old = oldByDay.get(day);
    if (cancel) {
      // Only clear this exact booking; individually changed days remain intact.
      if (old?.range?.id !== input.rangeId || old.units !== 0 || !RANGE_STATUSES.includes(old.status as typeof RANGE_STATUSES[number])) continue;
    } else {
      if (legacyDays.has(day) && !old) throw Error(`${day}에 이전 장부 기록이 있습니다. 해당 날짜를 제외해주세요.`);
      if (old && (old.units > 0 || ['present','makeup','makeup_reserved'].includes(old.status || 'present'))) throw Error(`${day}에 출석·보강 예약 또는 차감 기록이 있습니다. 해당 기록을 개별 수정하거나 기간에서 제외해주세요.`);
      if (old?.range?.id === input.rangeId && old.status === input.status && old.note === note) continue;
    }
    if (old && ((!cancel && old.updatedAt !== (revisions[day] || '')) || (cancel && revisions[day] !== undefined && old.updatedAt !== revisions[day]))) throw Error(`${day} 기록이 변경됐습니다. 창을 닫고 다시 확인해주세요.`);
    const row: Attendance = {...old,id:`${student.id}_${day}`,studentId:student.id,name:student.name,day,at:old?.at || stamp,updatedAt:stamp,source:old?.source || 'manual',units:0,status:cancel?'cancelled':input.status as typeof RANGE_STATUSES[number],note:cancel?(old?.note || ''):note,relatedDay:''};
    if (cancel) delete row.range;
    else row.range = {id:input.rangeId,start:days[0],end:days[days.length-1]};
    changes.push(row);
  }
  return changes;
}
