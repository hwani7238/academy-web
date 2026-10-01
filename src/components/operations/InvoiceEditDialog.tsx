'use client';
import { useEffect, useRef, useState } from 'react';
import { type Account, type Invoice, seoulDay } from '@/lib/operations/model';
import { displayCourseName } from '@/lib/operations/student-order';
import { CloseButton } from './CloseButton';

export function InvoiceEditDialog({ invoice, account, save, close }: {
  invoice: Invoice; account?: Account; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [units, setUnits] = useState(String(invoice.units)), [amount, setAmount] = useState(String(invoice.amount));
  const [kind, setKind] = useState(invoice.creditUnits === 0 ? 'current' : 'next');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="quick-attendance registration-dialog" aria-labelledby="invoice-edit-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><h2 id="invoice-edit-title">{displayCourseName(invoice.name)} · 청구 수정</h2><CloseButton disabled={busy} onClick={close} /></div>
    <form onSubmit={async e => {
      e.preventDefault(); if (lock.current) return;
      const form = Object.fromEntries(new FormData(e.currentTarget)); lock.current = true; setBusy(true); setError('');
      try { await save({ ...form, action: 'editInvoice', invoiceId: invoice.id, expectedUpdatedAt: invoice.updatedAt || '', units: Number(units), amount: Number(amount), kind }); close(); }
      catch (e) { setError(e instanceof Error ? e.message : '저장 실패'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <p>기존 청구: {invoice.units}회 · {invoice.amount.toLocaleString('ko-KR')}원</p>
        {account && <><p>현재 수강 설정: {account.planUnits}회 · {account.planAmount.toLocaleString('ko-KR')}원 · 잔여 {account.remaining}회</p><button type="button" onClick={() => { setUnits(String(account.planUnits)); setAmount(String(account.planAmount)); }}>현재 수강 설정 불러오기</button></>}
        <label>청구 횟수<input type="number" required min="1" max="200" value={units} onChange={e => setUnits(e.target.value)} /></label>
        <label>청구 금액 (원)<input type="number" inputMode="numeric" required min="1" max="100000000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>수납 완료 시 횟수 처리<select value={kind} onChange={e => setKind(e.target.value)}><option value="next">새 수강권 횟수 추가</option><option value="current">이미 횟수 반영됨 · 현재 잔여 유지</option></select></label>
        {kind === 'current' && <label>1회차 시작일<input name="cycleStart" type="date" required max={invoice.id === `first_${invoice.studentId}` ? undefined : seoulDay()} defaultValue={invoice.cycleStart || (invoice.id === `first_${invoice.studentId}` ? '' : seoulDay())} /></label>}
        <p>{kind === 'current' ? '수납해도 횟수를 다시 추가하지 않습니다. 이미 새 수강권의 잔여를 입력했다면 선택하세요.' : `전액 수납 시 ${units || '0'}회가 추가됩니다.`}</p>
        <label>변경 사유·비고<input name="note" maxLength={500} placeholder="예: 9/30 콩쿨반 전환, 12회·23만 원" /></label>
        <p>청구서만 수정합니다. 수강 설정·잔여 횟수는 유지되며, 수납이나 결제 안내 발송은 하지 않습니다.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '저장 중…' : '청구 수정 저장'}</button>
      </fieldset>
    </form>
  </dialog>;
}
