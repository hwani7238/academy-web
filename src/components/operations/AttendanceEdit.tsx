'use client';
import { useRef, useState } from 'react';
import type { Attendance } from '@/lib/operations/model';

export function AttendanceEdit({ attendance, busy, save, close }: {
  attendance: Attendance;
  busy: boolean;
  save: (input: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancelled = attendance.status === 'cancelled';
  async function submit(cancel: boolean) {
    if (busy || !form.current) return;
    const values = new FormData(form.current);
    try {
      await save({ action: 'recordAttendance', studentId: attendance.studentId, day: attendance.day,
        status: cancel ? 'cancelled' : attendance.status || 'present',
        units: cancel ? 0 : Number(values.get('units')), note: String(values.get('note') || ''),
        relatedDay: attendance.relatedDay || '', expectedUpdatedAt: attendance.updatedAt });
      close();
    } catch { /* The parent displays the server error without closing the form. */ }
  }
  return <form ref={form} onSubmit={e => { e.preventDefault(); void submit(false); }}>
    <label>차감 횟수<input name="units" type="number" min="0" max={cancelled ? 0 : 10} defaultValue={attendance.units} readOnly={cancelled} required />
      <small>{cancelled ? '취소된 출석입니다. 다시 출석 처리하려면 월별 출석표에서 변경해주세요.' : '2회 연속 수업은 2를 입력하세요. 출석 자체를 취소하려면 아래 출석 취소를 눌러주세요.'}</small></label>
    <label>변경 사유·비고 (선택)<textarea name="note" defaultValue={attendance.note} maxLength={500} /></label>
    <button className="primary" disabled={busy || confirming}>변경 기록 저장</button>
    {!cancelled && <><p className="subtle">출석 취소 시 {attendance.units}회가 복원되고 취소 기록이 남습니다. 이미 발송된 출석 알림은 회수되지 않습니다.</p>
      {confirming ? <div role="group" aria-label="출석 취소 확인">
        <p>{attendance.name} 학생의 {attendance.day} 출석을 취소할까요?</p>
        <button type="button" disabled={busy} onClick={() => void submit(true)}>출석 취소 확인</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>돌아가기</button>
      </div> : <button type="button" disabled={busy} onClick={() => setConfirming(true)}>출석 취소</button>}</>}
  </form>;
}
