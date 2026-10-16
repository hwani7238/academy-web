import { validDay, type Snapshot } from './model';
import { displayEnrollmentName } from './student-order';
import { enrollmentState } from './lifecycle';

export type LessonReference = { studentId: string; day: string; value: string; color: string; row: number };
export type LessonSourceRow = { label: string; row: number; cells: { day: string; value: string; color: string }[] };
export const lessonIdentity = (value: string) => value.replace(/\s/g, '').replace(/님(?=·)/, '');

// Half lessons are displayed exactly as recorded. They do not change charged units.
export function referenceOrdinal(value: string) {
  if (!/^\d+(?:\.5)?(?:[,+]\d+(?:\.5)?)*$/.test(value)) return null;
  const numbers = value.split(/[,+]/).map(Number);
  if (numbers.some(n => n < 0.5 || n > 200)) return null;
  const whole = numbers.filter(n => n >= 1);
  if (!whole.length) return null;
  return { label: value.replace(/,/g, '·'), position: Math.floor(whole[whole.length - 1]), first: whole.includes(1) };
}

export function parseLessonSource(input: unknown, month: string): LessonSourceRow[] {
  validDay(`${month}-01`);
  if (!Array.isArray(input) || !input.length || input.length > 500) throw Error('학생별 장부 자료를 확인해주세요.');
  return input.map(raw => {
    if (!raw || typeof raw.label !== 'string' || !raw.label.includes('·') || raw.label.length > 150 || !Number.isSafeInteger(raw.row) || raw.row < 1 || !Array.isArray(raw.cells) || raw.cells.length > 31) throw Error('장부 이름·과목·행 번호를 확인해주세요.');
    const seen = new Set<string>();
    const cells = raw.cells.map((cell: { day: unknown; value: unknown; color: unknown }) => {
      const day = validDay(cell.day);
      const value = typeof cell.value === 'string' ? cell.value.replace(/\s/g, '').replace(/＋/g, '+') : '';
      if (!day.startsWith(`${month}-`) || seen.has(day) || !referenceOrdinal(value)) throw Error(`${raw.label}: 날짜 또는 회차를 확인해주세요.`);
      seen.add(day);
      const color = typeof cell.color === 'string' && /^#[0-9a-f]{6}$/i.test(cell.color) ? cell.color.toUpperCase() : '';
      return { day, value, color };
    });
    return { label: raw.label.trim(), row: raw.row, cells };
  });
}

export function matchLessonSource(rows: LessonSourceRow[], students: Snapshot['students'], today: string) {
  const counts = new Map<string, number>();
  for (const row of rows) { const key = lessonIdentity(row.label); counts.set(key, (counts.get(key) || 0) + 1); }
  const references: LessonReference[] = [];
  const matched: { label: string; row: number; studentId: string; count: number }[] = [];
  const excluded: { label: string; row: number; reason: string }[] = [];
  for (const row of rows) {
    const key = lessonIdentity(row.label);
    const candidates = students.filter(s => lessonIdentity(displayEnrollmentName(s)) === key && enrollmentState(s.lifecycle, today) === 'active');
    if (counts.get(key)! > 1 || candidates.length !== 1) {
      excluded.push({ label: row.label, row: row.row, reason: counts.get(key)! > 1 || candidates.length > 1 ? '동명이인·중복 행 확인 필요' : '이름·과목이 일치하는 재원 수강권 없음' });
      continue;
    }
    matched.push({ label: row.label, row: row.row, studentId: candidates[0].id, count: row.cells.length });
    references.push(...row.cells.map(cell => ({ ...cell, studentId: candidates[0].id, row: row.row })));
  }
  return { references, matched, excluded };
}
