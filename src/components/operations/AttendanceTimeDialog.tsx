'use client';
import { useEffect, useRef, useState } from 'react';
import type { Attendance } from '@/lib/operations/model';
import { attendanceClock } from '@/lib/operations/attendance-time';

export function AttendanceTimeDialog({ attendance, busy, save, close }: {
  attendance: Attendance; busy: boolean; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="quick-attendance" aria-labelledby="attendance-time-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="section-head"><div><h2 id="attendance-time-title">출석 시간 수정</h2><p>{attendance.name} · {attendance.day}</p></div><button type="button" disabled={busy} onClick={close}>닫기</button></div>
    <form onSubmit={e => { e.preventDefault(); const time = String(new FormData(e.currentTarget).get('time') || ''); setError(''); void save({ action: 'correctAttendanceTime', attendanceId: attendance.id, time, expectedUpdatedAt: attendance.updatedAt }).then(close).catch(e => setError(e instanceof Error ? e.message : '저장하지 못했습니다.')); }}>
      <label>출석 시간<input name="time" type="time" step="60" defaultValue={attendanceClock(attendance)} required autoFocus /></label>
      <p className="subtle">출석 날짜는 그대로 두고 시간만 변경합니다. 수강 횟수는 바뀌지 않습니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '시간 저장'}</button>
    </form>
  </dialog>;
}
