'use client';
import { useRef, useState } from 'react';
import type { Invoice } from '@/lib/operations/model';
import { invoiceReviewMessage, invoiceReviewRevision } from '@/lib/operations/invoice-review';

export function InvoiceReviewPanel({ invoice, busy = false, save, cancelled, confirmed, onBusyChange }: {
  invoice: Invoice;
  busy?: boolean;
  save: (input: Record<string, unknown>) => Promise<unknown>;
  cancelled: () => void;
  confirmed?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const reason = invoice.reviewReason, disabled = busy || pending;
  async function choose(action: 'confirmInvoice' | 'cancelInvoice') {
    if (lock.current || busy) return;
    lock.current = true; setPending(true); setError(''); onBusyChange?.(true);
    try {
      await save({ action, invoiceId: invoice.id, expectedReviewRevision: invoiceReviewRevision(invoice) });
      if (action === 'cancelInvoice') cancelled();
      else confirmed?.();
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { lock.current = false; setPending(false); onBusyChange?.(false); }
  }
  return <section className="notice invoice-review" aria-label="청구 유지 여부 확인">
    <strong>{invoiceReviewMessage(invoice)}</strong>
    {reason && <p>남은 횟수 {reason.beforeRemaining}회 → <strong>{reason.afterRemaining}회</strong></p>}
    <p>{invoice.lessonDate || invoice.cycleStart || '1회차 날짜 미확인'} · {invoice.units}회권 · 청구 {invoice.amount.toLocaleString('ko-KR')}원<br/>미납 {(invoice.amount - invoice.paid).toLocaleString('ko-KR')}원</p>
    <p>유지하면 이 청구로 수납을 계속할 수 있어요. 청구가 필요 없어졌다면 취소하세요. 수납 내역과 남은 횟수는 바뀌지 않습니다.</p>
    {invoice.status === 'open' ? <>
      <div className="billing-detail-actions">
        <button type="button" className="primary" disabled={disabled} onClick={() => void choose('confirmInvoice')}>{pending ? '처리 중…' : '청구 유지'}</button>
        <button type="button" className="danger-text" disabled={disabled || invoice.paid > 0 || invoice.reservedPass} onClick={() => void choose('cancelInvoice')}>청구 취소</button>
      </div>
      {invoice.paid > 0 && <small>이미 일부 수납한 청구는 바로 취소할 수 없어요. 월별 수납 기록을 먼저 확인해주세요.</small>}
      {invoice.reservedPass && <small>예약 수강권 취소는 총 등록 현황의 수강권 관리에서 할 수 있어요.</small>}
    </> : <p>이미 수납되었거나 취소된 청구입니다. 청구·수납에서 최신 내역을 확인해주세요.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
