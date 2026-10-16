'use client';
import { useEffect, useRef, useState } from 'react';
import { ATTENDANCE_LABELS, type AttendanceStatus, type LegacyAttendance } from '@/lib/operations/model';
import { legacyAttendanceAppearance } from '@/lib/operations/attendance-appearance';
import { CloseButton } from './CloseButton';

export function LegacyAttendanceDialog({ row, name, save, close }: {
  row: LegacyAttendance; name: string; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const appearance = legacyAttendanceAppearance(row);
  const initialStatus = row.status || (appearance.tone === 'payment-due' ? 'present' : appearance.tone as AttendanceStatus);
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [ordinal, setOrdinal] = useState(Number.isSafeInteger(Number(row.value)) && Number(row.value) > 0 ? String(Number(row.value)) : '');
  const [note, setNote] = useState(row.note || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ref = useRef<HTMLDialogElement>(null), lock = useRef(false), revision = useRef(row.revision);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function commit(nextStatus = status) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await save({ action: 'correctLegacyAttendance', studentId: row.studentId, day: row.day, status: nextStatus,
        ordinal: nextStatus === 'cancelled' || ordinal === '' ? '' : Number(ordinal), note, expectedRevision: revision.current });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={ref} className="quick-attendance" aria-labelledby="legacy-edit-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><div><h2 id="legacy-edit-title">{name} · 이전 출결 수정</h2><p>{row.day} · 현재 {row.value || '취소'} {appearance.label}</p></div><CloseButton disabled={busy} onClick={close}/></div>
    <form onSubmit={e => { e.preventDefault(); void commit(); }}>
      <label>출결 상태<select value={status} disabled={busy} onChange={e => setStatus(e.target.value as AttendanceStatus)}>{Object.entries(ATTENDANCE_LABELS).filter(([key]) => key !== 'cancelled' && key !== 'makeup_reserved').map(([key, label]) => <option key={key} value={key}>{label}</option>)}{status === 'cancelled' && <option value="cancelled">취소</option>}</select></label>
      <label>수강권 회차<input type="number" min="1" max="200" value={ordinal} disabled={busy || status === 'cancelled'} required={status === 'present'} onChange={e => setOrdinal(e.target.value)} placeholder="예: 5"/><small>차감 횟수가 아닌 출석표에 표시할 회차입니다. 결석·여행 등은 비워둘 수 있습니다.</small></label>
      <label>비고 (선택)<textarea maxLength={500} value={note} disabled={busy} onChange={e => setNote(e.target.value)}/></label>
      <p className="subtle">이전 출결 표시를 정정합니다. 현재 잔여 횟수와 수납은 바뀌지 않으며 알림톡도 발송하지 않습니다. 잔여 횟수도 다르면 총 등록 현황에서 별도로 수정해주세요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '수정 저장'}</button>
      {row.status !== 'cancelled' && <button type="button" className="danger-text" disabled={busy} onClick={() => void commit('cancelled')}>기록 취소</button>}
    </form>
  </dialog>;
}
