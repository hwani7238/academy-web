import type { Snapshot } from './model';
export const GROUPS = ['성인 피아노', '어린이 피아노(1관)', '어린이 피아노(2관)', '앙상블', '보컬', '드럼', '우쿨렐레', '기타', '미디'];
export function groupName(student: Snapshot['students'][number]) {
  const value = student.attendanceGroup || student.instruments?.[0] || '';
  if (value.includes('앙상블')) return '앙상블';
  if (['통기타', '일렉기타', '일렉', '베이스', '기타'].includes(value)) return '기타';
  if (value === '피아노(성인)') return '성인 피아노';
  if (value === '어린이 피아노' || value === '피아노(어린이)') return '어린이 피아노(관 미확인)';
  return value || '과목 미지정';
}
const korean = new Intl.Collator('ko', { numeric: true });
function rank(group: string) { const index = GROUPS.indexOf(group); return index >= 0 ? index : group === '어린이 피아노(관 미확인)' ? 2.5 : GROUPS.length; }
export const compareGroups = (a: string, b: string) => rank(a) - rank(b) || korean.compare(a, b);
export const compareNames = (a: string, b: string) => korean.compare(a.split(' · ')[0].trim(), b.split(' · ')[0].trim());
export const compareStudents = (a: Snapshot['students'][number], b: Snapshot['students'][number]) => compareNames(a.name, b.name) || compareGroups(groupName(a), groupName(b)) || korean.compare(a.id, b.id);
