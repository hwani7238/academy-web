export type AttendanceProfile = { role?: string; status?: string; subject?: string; subjects?: string[] };
export const koreaDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
export const isPiano = (value: unknown): value is string => typeof value === 'string' && value.includes('피아노');
export function teacherAttendanceCourse(value: unknown): '어린이 피아노' | '드럼' | null {
  if (isPiano(value)) return '어린이 피아노';
  return typeof value === 'string' && value.trim() === '드럼' ? '드럼' : null;
}
export function canViewTeacherAttendance(profile?: AttendanceProfile) {
  if (!profile) return false;
  if (['admin', 'wonjang', 'siljang'].includes(profile.role || '')) return true;
  const subjects = profile.subjects?.length ? profile.subjects : [profile.subject];
  return profile.role === 'teacher' && (profile.status ?? 'approved') === 'approved' && subjects.some(subject => teacherAttendanceCourse(subject) !== null);
}

export type TeacherArrival = { studentId: string; updatedAt: string; source: 'kiosk' | 'teacher' | 'manual'; id: string; name: string; course: string; arrivalAt: string; status: 'present' | 'makeup' };
export type TeacherWaiting = { studentId:string; name:string; course:string; lessonTime:string; status:'waiting'|'makeup_reserved'|'absent'|'travel'|'sick'|'late_cancel' };
export type TeacherAttendanceData = { day: string; checkedAt: string; arrivals: TeacherArrival[]; waiting?:TeacherWaiting[] };
type RecordData = Record<string, unknown>;
// Use an allowlist: financial fields, phone numbers and notes never enter this DTO.
export function teacherArrival(id: string, row: RecordData, account: RecordData | undefined, owner: RecordData | undefined, day: string): TeacherArrival | null {
  if (row.day !== day || !['kiosk','teacher','manual'].includes(String(row.source)) || !['present', 'makeup'].includes(String(row.status || 'present'))) return null;
  if (!account || !owner) return null;
  const instruments = Array.isArray(owner.instruments) ? owner.instruments : [];
  const subject = typeof account.subject === 'string' && account.subject
    || (instruments.length === 1 ? String(instruments[0]) : typeof owner.instrument === 'string' ? owner.instrument : '')
    || String(account.name || '').split(' · ')[1] || '';
  const groups = owner.operationsCourseGroups as Record<string, string> | undefined;
  const course = groups?.[subject] || account.attendanceGroup || account.displaySubject || subject;
  const label = teacherAttendanceCourse(subject);
  if (!label || teacherAttendanceCourse(course) !== label) return null;
  const timestamp = typeof row.arrivalAt === 'string' && row.arrivalAt || row.source !== 'manual' && typeof row.at === 'string' && row.at || '';
  const date = new Date(timestamp);
  const arrivalAt = Number.isFinite(date.getTime()) && koreaDay(date) === day ? date.toISOString() : '';
  return { id, studentId: String(row.studentId || ''), updatedAt: String(row.updatedAt || ''), source: row.source === 'manual' ? 'manual' : row.source === 'teacher' ? 'teacher' : 'kiosk', name: String(owner.name || account.name || '학생').split(' · ')[0], course: label, arrivalAt, status: row.status === 'makeup' ? 'makeup' : 'present' };
}

export type TeacherStudent = { id: string; name: string; course: string; attended: boolean };
export type TeacherRoster = { day: string; students: TeacherStudent[] };

export type TeacherAttendanceOrder = 'name' | 'earliest' | 'latest';
type AttendanceSortRow = { name: string; course: string; studentId: string; arrival?: TeacherArrival; waiting?: TeacherWaiting };
export function compareTeacherAttendance(a: AttendanceSortRow, b: AttendanceSortRow, order: TeacherAttendanceOrder) {
  if (Boolean(a.arrival) !== Boolean(b.arrival)) return a.arrival ? -1 : 1;
  if (a.waiting && b.waiting) {
    const statusDifference = waitingStatusPriority(a.waiting.status) - waitingStatusPriority(b.waiting.status);
    if (statusDifference) return statusDifference;
  }
  if (order !== 'name') {
    // Keep arrivals with unknown times after timed arrivals, and waiting students last.
    const time = (row: AttendanceSortRow) => row.arrival?.arrivalAt ? Date.parse(row.arrival.arrivalAt) : NaN;
    const ta = time(a), tb = time(b);
    const group = (row: AttendanceSortRow, timestamp: number) => Number.isFinite(timestamp) ? 0 : row.arrival ? 1 : 2;
    const groupDifference = group(a, ta) - group(b, tb);
    if (groupDifference) return groupDifference;
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return order === 'earliest' ? ta - tb : tb - ta;
  }
  return a.name.localeCompare(b.name, 'ko') || a.course.localeCompare(b.course, 'ko') || a.studentId.localeCompare(b.studentId);
}

// Expected arrivals (including booked makeup) first, known absences next, same-day cancellations last.
export function waitingStatusPriority(status: TeacherWaiting['status']) {
  if (status === 'waiting' || status === 'makeup_reserved') return 0;
  return status === 'late_cancel' ? 2 : 1;
}
