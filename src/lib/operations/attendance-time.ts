import { seoulDay, validDay, type Attendance } from './model';

export function attendanceTimeMs(row: Attendance): number | undefined {
  const value = row.arrivalAt || (row.source !== 'manual' ? row.at : '');
  const time = Date.parse(value);
  return Number.isFinite(time) && seoulDay(new Date(time)) === row.day ? time : undefined;
}

export function attendanceClock(row: Attendance): string {
  const time = attendanceTimeMs(row);
  return time === undefined ? '' : new Date(time).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function correctedArrival(day: string, clock: unknown): string {
  validDay(day);
  if (typeof clock !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw Error('출석 시간을 시:분 형식으로 입력해주세요.');
  return new Date(`${day}T${clock}:00+09:00`).toISOString();
}
