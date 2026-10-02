import { ATTENDANCE_LABELS, integer, type AttendanceStatus, type LegacyAttendance } from './model';
export type LegacyCorrection = { studentId: string; day: string; value: string; color: string; status: AttendanceStatus; note: string; updatedAt: string };

export function correctedLegacy(original: LegacyAttendance, correction?: LegacyCorrection): LegacyAttendance {
  return { ...original, ...(correction ? { value: correction.value, color: correction.color, status: correction.status, note: correction.note } : {}),
    revision: JSON.stringify([original.value, original.color, correction?.updatedAt || '']) };
}
export function legacyCorrectionInput(input: Record<string, unknown>) {
  const status = input.status as AttendanceStatus;
  if (!Object.hasOwn(ATTENDANCE_LABELS, status) || status === 'makeup_reserved') throw Error('출결 상태를 선택해주세요.');
  const ordinal = input.ordinal === '' || input.ordinal == null ? null : integer(input.ordinal, 1, 200, '수강권 회차');
  if (status === 'present' && ordinal === null) throw Error('수강권 회차를 입력해주세요.');
  const value = status === 'cancelled' ? '' : ordinal === null ? ATTENDANCE_LABELS[status] : String(ordinal);
  const color = ['absent','travel','sick','late_cancel'].includes(status) ? 'FFCCCCCC' : status === 'makeup' ? 'FFFF9900' : '';
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  return { value, color, status, note };
}
