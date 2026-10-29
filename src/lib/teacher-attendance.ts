export type AttendanceProfile = { role?: string; status?: string; subject?: string; subjects?: string[] };
export const koreaDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
export const isPiano = (value: unknown): value is string => typeof value === 'string' && value.includes('피아노');
export function canViewPianoAttendance(profile?: AttendanceProfile) {
  if (!profile) return false;
  if (['admin', 'wonjang', 'siljang'].includes(profile.role || '')) return true;
  const subjects = profile.subjects?.length ? profile.subjects : [profile.subject];
  return profile.role === 'teacher' && (profile.status ?? 'approved') === 'approved' && subjects.some(isPiano);
}

export type PianoArrival = { studentId: string; updatedAt: string; source: 'kiosk' | 'teacher'; id: string; name: string; course: string; arrivalAt: string; status: 'present' | 'makeup' };
export type PianoAttendance = { day: string; checkedAt: string; arrivals: PianoArrival[] };
type RecordData = Record<string, unknown>;
// Use an allowlist: financial fields, phone numbers and notes never enter this DTO.
export function pianoArrival(id: string, row: RecordData, account: RecordData | undefined, owner: RecordData | undefined, day: string): PianoArrival | null {
  if (row.day !== day || !['kiosk','teacher'].includes(String(row.source)) || !['present', 'makeup'].includes(String(row.status || 'present'))) return null;
  if (!account || !owner) return null;
  const instruments = Array.isArray(owner.instruments) ? owner.instruments : [];
  const subject = typeof account.subject === 'string' && account.subject
    || (instruments.length === 1 ? String(instruments[0]) : typeof owner.instrument === 'string' ? owner.instrument : '')
    || String(account.name || '').split(' · ')[1] || '';
  const groups = owner.operationsCourseGroups as Record<string, string> | undefined;
  const course = groups?.[subject] || account.attendanceGroup || account.displaySubject || subject;
  if (!isPiano(subject) || !isPiano(course)) return null;
  const timestamp = typeof row.arrivalAt === 'string' && row.arrivalAt || typeof row.at === 'string' && row.at || '';
  const date = new Date(timestamp);
  const arrivalAt = Number.isFinite(date.getTime()) && koreaDay(date) === day ? date.toISOString() : '';
  return { id, studentId: String(row.studentId || ''), updatedAt: String(row.updatedAt || ''), source: row.source === 'teacher' ? 'teacher' : 'kiosk', name: String(owner.name || account.name || '학생').split(' · ')[0], course, arrivalAt, status: row.status === 'makeup' ? 'makeup' : 'present' };
}

export type PianoStudent = { id: string; name: string; course: string; attended: boolean };
export type PianoRoster = { day: string; students: PianoStudent[] };
