'use client';
import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@/lib/operations/model';
import { CloseButton } from './CloseButton';

export function InvoiceDateDialog({ invoice, initialDate, save, close }: {
  invoice: Invoice; initialDate?: string; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="quick-attendance" aria-labelledby="invoice-date-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><h2 id="invoice-date-title">{invoice.name.split(' · ')[0]} · 1회차 날짜</h2><CloseButton disabled={busy} onClick={close}/></div>
    <form onSubmit={async e => {
      e.preventDefault(); if (lock.current) return;
      const form=new FormData(e.currentTarget),lessonDate=form.get('lessonDate'),allocation=form.get('allocation'); lock.current = true; setBusy(true); setError('');
      try { await save({ action: 'linkInvoiceLesson', invoiceId: invoice.id, lessonDate, allocation, expectedUpdatedAt: invoice.updatedAt || '' }); close(); }
      catch (e) { setError(e instanceof Error ? e.message : '날짜를 저장하지 못했습니다.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <label>1회차 날짜<input name="lessonDate" type="date" defaultValue={initialDate || ''} required disabled={busy}/></label>
      {!invoice.passId&&invoice.status==='open'&&invoice.creditUnits!==0&&<label>기존 횟수 반영 상태<select name="allocation" required defaultValue=""><option value="" disabled>확인 후 선택해주세요</option><option value="already">이미 잔여에 반영됨 · 횟수 유지</option><option value="activate">아직 반영 안 됨 · 수강권 시작하며 {invoice.units}회 부여</option><option value="pending">다음 수강권 · 첫 출석 때 부여</option></select></label>}
      <p className="subtle">이 청구에 해당하는 수강권의 첫 수업일을 입력하세요. 수납 금액은 다시 기록하지 않습니다. 기존 횟수가 아직 반영되지 않았다고 선택한 경우에만 수강권을 시작합니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '날짜 저장'}</button>
    </form>
  </dialog>;
}
