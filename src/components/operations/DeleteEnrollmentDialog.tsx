'use client';
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/operations/model';
import { displayEnrollmentName } from '@/lib/operations/student-order';
import { CloseButton } from './CloseButton';

export function DeleteEnrollmentDialog({ student, save, close }: {
  student: Snapshot['students'][number]; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  async function remove() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await save({ action: 'deleteEnrollment', studentId: student.id, sourceStudentId: student.sourceStudentId || student.id, expectedUpdatedAt: student.lifecycle?.updatedAt || '' });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={ref} className="quick-attendance" aria-labelledby="delete-enrollment-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><h2 id="delete-enrollment-title">목록에서 삭제할까요?</h2><CloseButton disabled={busy} onClick={close}/></div>
    <p><strong>{displayEnrollmentName(student)}</strong></p>
    <p className="quick-attendance-help">선택한 과목만 삭제합니다. 출결·잔여 횟수·수납 기록과 미납 청구는 보관되며, 다른 과목에는 영향이 없습니다. 삭제한 휴원 과목은 종료일이 지나도 자동 복귀하지 않습니다.</p>
    <p className="quick-attendance-help">‘삭제된 항목’에서 다시 복원할 수 있습니다.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="danger-text" disabled={busy} onClick={() => void remove()}>{busy ? '삭제 중…' : '목록에서 삭제'}</button>
  </dialog>;
}
