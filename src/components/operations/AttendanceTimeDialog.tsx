'use client';
import { CloseButton } from './CloseButton';
import { TimeWheelPicker } from './TimeWheelPicker';
import { useEffect, useRef, useState } from 'react';
import type { Attendance } from '@/lib/operations/model';
import { attendanceClock } from '@/lib/operations/attendance-time';

export function AttendanceTimeDialog({ attendance, busy, save, close }: {
  attendance: Attendance; busy: boolean; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [time, setTime] = useState(() => attendanceClock(attendance) || new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }));
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="quick-attendance" aria-labelledby="attendance-time-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="section-head"><div><h2 id="attendance-time-title">출석 시간 수정</h2><p>{attendance.name} · {attendance.day}</p></div><CloseButton disabled={busy} onClick={close} /></div>
    <form onSubmit={e => { e.preventDefault(); if (busy) return; setError(''); void save({ action: 'correctAttendanceTime', attendanceId: attendance.id, time, expectedUpdatedAt: attendance.updatedAt }).then(close).catch(e => setError(e instanceof Error ? e.message : '저장하지 못했습니다.')); }}>
      <TimeWheelPicker value={time} disabled={busy} onChange={setTime} />
      <p className="subtle">출석 날짜는 그대로 두고 시간만 변경합니다. 수강 횟수는 바뀌지 않습니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '시간 저장'}</button>
    </form>
  </dialog>;
}
