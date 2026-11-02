'use client';
import {useEffect,useRef,useState} from 'react';
import {type Account,type Invoice,type Payment} from '@/lib/operations/model';
import {historicalPaymentConflict} from '@/lib/operations/historical-payment';
import {CloseButton} from './CloseButton';

export function RestorePaymentPassDialog({invoice,payment,account,save,close}:{invoice:Invoice;payment:Payment;account:Account;save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const conflict=historicalPaymentConflict(invoice,payment);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance monthly-payment-dialog" aria-labelledby="restore-pass-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}>
  <div className="section-head"><h2 id="restore-pass-title">과거 수납 연결 복구</h2><CloseButton disabled={busy} onClick={close}/></div>
  <p>{invoice.name} · {invoice.units}회권</p>
  {conflict?<><p className="notice">수납 당시 시작일은 <strong>{conflict.originalStart}</strong>인데, 지금은 <strong>{conflict.currentStart}</strong> 수강권에 연결돼 있습니다.</p>
   <p>기존 {invoice.paid.toLocaleString()}원 수납은 {conflict.originalStart} 수강권으로 돌려놓고, {conflict.currentStart} 수강권을 미납으로 분리합니다.</p>
   <p>출결 날짜·상태·차감 횟수와 수납 날짜·금액·결제수단을 유지합니다. 이미 반영된 수강 횟수를 다시 추가하지 않습니다.</p>
   <p className="notice">복구 전후 잔여 <strong>{account.remaining}회 → {account.remaining}회</strong></p>
   <button className="primary" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await save({action:'repairHistoricalPass',invoiceId:invoice.id,...conflict,expectedAccountUpdatedAt:account.updatedAt,expectedInvoiceUpdatedAt:invoice.updatedAt||''});close();}catch(e){setError(e instanceof Error?e.message:'복구하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>{busy?'복구 중…':'과거 수납 복구 · 현재 수강권 미납으로 분리'}</button>
  </>:<p>복구할 날짜 불일치가 없습니다. 창을 닫고 다시 확인해주세요.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
 </dialog>;
}
