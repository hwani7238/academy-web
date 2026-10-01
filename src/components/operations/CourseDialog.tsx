'use client';
import { useEffect, useRef, useState } from 'react';
import { CloseButton } from './CloseButton';
import { Snapshot } from '@/lib/operations/model';
import { REGISTRATION_SUBJECTS } from '@/lib/operations/registration';
import { groupName } from '@/lib/operations/student-order';

export function CourseDialog({ student, save, close }: { student: Snapshot['students'][number]; save: (v: Record<string, unknown>) => Promise<unknown>; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const originalName = student.name.split(' · ')[0];
  const originalGroup = student.attendanceGroup || student.instruments?.[0] || student.subject || '';
  const [name, setName] = useState(originalName), [phone, setPhone] = useState(student.phone);
  const [mode, setMode] = useState('change'), [group, setGroup] = useState(originalGroup);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const nameChanged = name.trim() !== originalName;
  const phoneChanged = phone.trim() !== student.phone;
  const courseChanged = mode === 'add' || group !== originalGroup;
  const changed = nameChanged || phoneChanged || courseChanged;
  useEffect(() => { ref.current?.showModal(); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (lock.current || !changed) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await save({ action: 'saveStudentInfo', studentId: student.id, sourceStudentId: student.sourceStudentId || student.id,
        expectedName: originalName, expectedPhone: student.phone,
        expectedCourseUpdatedAt: student.courseUpdatedAt || '', expectedPhoneUpdatedAt: student.phoneUpdatedAt || '',
        ...(nameChanged ? { name } : {}), ...(phoneChanged ? { phone } : {}),
        ...(courseChanged ? { mode, group, subject: student.subject || student.instruments?.[0] || '' } : {}),
      });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <dialog ref={ref} className="quick-attendance registration-dialog" aria-labelledby="course-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><h2 id="course-title">{originalName} · 학생 정보 관리</h2><CloseButton disabled={busy} onClick={close} /></div>
    <form onSubmit={submit}>
      <label>학생 이름<input name="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required disabled={busy} /></label>
      <label>보호자 전화번호<input name="phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-1234-5678" maxLength={30} required={phoneChanged} disabled={busy} /></label>
      <p className="subtle">이름과 보호자 번호는 모든 수강 과목에 반영됩니다. 번호를 바꾸면 보호자 출석번호와 알림 수신번호도 함께 바뀝니다.</p>
      <hr className="student-info-divider" />
      <label>변경 방법<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setGroup(e.target.value === 'add' ? '' : originalGroup); }}><option value="change">현재 과목·반 변경</option><option value="add">다른 과목 추가</option></select></label>
      <label>{mode === 'add' ? '추가할 과목·반' : '과목·반'}<select value={group} onChange={e => setGroup(e.target.value)} required={courseChanged} disabled={busy}>
        {mode === 'add' ? <option value="" disabled>선택해주세요</option> : !REGISTRATION_SUBJECTS.includes(originalGroup) && <option value={originalGroup}>{groupName(student)} (현재)</option>}
        {REGISTRATION_SUBJECTS.map(v => <option key={v} value={v}>{v}</option>)}
      </select></label>
      <p className="subtle">{mode === 'add' ? '기존 과목을 유지하고 새 과목을 추가합니다. 추가한 과목의 수강료와 횟수는 수강권 설정에서 입력해주세요.' : '변경할 항목만 수정해주세요. 출결·수납 기록과 잔여 횟수는 그대로 유지됩니다.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy || !changed}>{busy ? '저장 중…' : '저장'}</button>
    </form>
  </dialog>;
}
