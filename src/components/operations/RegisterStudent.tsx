'use client';
import { useEffect, useRef, useState } from 'react';
import { REGISTRATION_SUBJECTS } from '@/lib/operations/registration';
export function RegisterStudent({ save, close }: { save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const locked = useRef(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [units, setUnits] = useState(8); const [remaining, setRemaining] = useState(8);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(locked.current)return; locked.current=true; setBusy(true); setError('');
    const fields = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await save({ ...fields, action:'registerStudent', requestId, planUnits:units, remaining, planAmount:Number(fields.planAmount) }); close(); }
    catch(e) { setError(e instanceof Error ? e.message : '등록하지 못했습니다.'); }
    finally { locked.current=false; setBusy(false); }
  }
  return <dialog ref={dialog} className="quick-attendance registration-dialog" aria-labelledby="registration-title" onCancel={e=>{e.preventDefault();if(!locked.current)close();}}>
    <div className="section-head"><h2 id="registration-title">신규 학생 등록</h2><button disabled={busy} onClick={close}>닫기</button></div>
    <form onSubmit={submit}>
      <label>학생 이름<input name="name" required maxLength={60} autoComplete="off" /></label>
      <label>과목<select name="group" required defaultValue=""><option value="" disabled>과목 선택</option>{REGISTRATION_SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>보호자 전화번호<input name="phone" type="tel" required placeholder="010-1234-5678" /><small>알림 수신 및 뒷번호 출석에 사용합니다.</small></label>
      <label>학생 전화번호 (선택)<input name="personalPhone" type="tel" /><small>입력하면 학생 번호 뒷자리로도 출석할 수 있습니다.</small></label>
      <div className="registration-grid"><label>수강권 횟수<input type="number" min="1" max="200" required value={units} onChange={e=>{const n=Number(e.target.value);setUnits(n);setRemaining(n);}} /><small>주 2회는 8회입니다.</small></label><label>수강료 (원)<input name="planAmount" type="number" min="1" max="100000000" required placeholder="170000" /></label></div>
      <label>처음 사용할 횟수<input type="number" min="0" max={units} required value={remaining} onChange={e=>setRemaining(Number(e.target.value))} /><small>등록 후 이 횟수에서 출석할 때마다 차감됩니다.</small></label>
      <p className="subtle">학생과 수강권을 함께 등록합니다. 수납 기록은 실제 결제 확인 후 청구·수납에서 관리하세요.</p>
      {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'등록 중…':'학생·수강권 등록'}</button>
    </form>
  </dialog>;
}
