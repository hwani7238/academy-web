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
      const lessonDate = new FormData(e.currentTarget).get('lessonDate'); lock.current = true; setBusy(true); setError('');
      try { await save({ action: 'linkInvoiceLesson', invoiceId: invoice.id, lessonDate, expectedUpdatedAt: invoice.updatedAt || '' }); close(); }
      catch (e) { setError(e instanceof Error ? e.message : '날짜를 저장하지 못했습니다.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <label>1회차 날짜<input name="lessonDate" type="date" defaultValue={initialDate || ''} required disabled={busy}/></label>
      <p className="subtle">이 청구에 해당하는 수강권의 첫 수업일을 입력하세요. 금액·수납 여부·남은 횟수와 출석표 회차는 그대로 유지됩니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '날짜 저장'}</button>
    </form>
  </dialog>;
}
