'use client';
import { useEffect, useRef, useState } from 'react';
import type { Account, Invoice } from '@/lib/operations/model';
import { CloseButton } from './CloseButton';

export function InvoiceDateDialog({ invoice, account, initialDate, save, close }: {
  invoice: Invoice; account?: Account; initialDate?: string; save: (input: Record<string, unknown>) => Promise<unknown>; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="quick-attendance" aria-labelledby="invoice-date-title" onCancel={e => { e.preventDefault(); if (!lock.current) close(); }}>
    <div className="section-head"><h2 id="invoice-date-title">{invoice.name.split(' · ')[0]} · 1회차 날짜</h2><CloseButton disabled={busy} onClick={close}/></div>
    <form onSubmit={async e => {
      e.preventDefault(); if (lock.current) return;
      const form=new FormData(e.currentTarget),lessonDate=form.get('lessonDate'),allocation=form.get('allocation'); lock.current = true; setBusy(true); setError('');
      try { await save({ action: 'linkInvoiceLesson', invoiceId: invoice.id, lessonDate, allocation, correctBoundary:form.get('correctBoundary')==='on', expectedAccountUpdatedAt:account?.updatedAt, expectedUpdatedAt: invoice.updatedAt || '' }); close(); }
      catch (e) { setError(e instanceof Error ? e.message : '날짜를 저장하지 못했습니다.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <p>{invoice.units}회권 · 수납 {invoice.paid.toLocaleString('ko-KR')}원{invoice.allocationState==='allocated'?' · 횟수 이미 반영됨':''}</p>
      {invoice.paid>0&&<p className="notice">기존 수납이 적용되는 수강권의 시작일을 수정합니다. 새 수강권을 등록하는 기능이 아니며, 잔여 횟수는 추가되지 않습니다. 새 수강권은 총 등록 현황의 수강권 관리에서 등록해주세요.</p>}
      <label>1회차 날짜<input name="lessonDate" type="date" defaultValue={initialDate || ''} required disabled={busy}/></label>
      {!invoice.passId&&invoice.status==='open'&&invoice.creditUnits!==0&&<label>기존 횟수 반영 상태<select name="allocation" required defaultValue=""><option value="" disabled>확인 후 선택해주세요</option><option value="already">이미 잔여에 반영됨 · 횟수 유지</option><option value="activate">아직 반영 안 됨 · 수강권 시작하며 {invoice.units}회 부여</option><option value="pending">다음 수강권 · 첫 출석 때 부여</option></select></label>}
      <p className="subtle">이 청구에 해당하는 수강권의 첫 수업일을 입력하세요. 수납 금액은 다시 기록하지 않습니다. 기존 횟수가 아직 반영되지 않았다고 선택한 경우에만 수강권을 시작합니다.</p>
      {account?.ledgerVersion!==2&&account?.currentPassId===invoice.passId&&invoice.status==='open'&&invoice.paid===0&&invoice.allocationState==='allocated'&&<label><input type="checkbox" name="correctBoundary" disabled={busy}/>현재 수강권 시작일·회차·잔여 함께 정정<small>새 수강권이 너무 일찍 시작된 경우 선택하세요. 이전 수강권 마지막 회차를 확인하고 출결의 연결과 잔여를 다시 계산합니다. 실제 출석 날짜·상태와 수납 기록은 유지합니다.</small></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? '저장 중…' : '날짜 저장'}</button>
    </form>
  </dialog>;
}
