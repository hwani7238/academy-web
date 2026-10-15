'use client';
import {useEffect,useRef,useState} from 'react';
import {type Payment,type Snapshot} from '@/lib/operations/model';
import {paymentCancellation} from '@/lib/operations/payment-cancellation';
import {paymentDay} from '@/lib/operations/billing-display';
import {CloseButton} from './CloseButton';

export function CancelPaymentDialog({payment,data,label,save,close}:{payment:Payment;data:Snapshot;label:string;save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 // Freeze what the owner is confirming; concurrent changes are rejected by the server.
 const [invoice]=useState(()=>[...data.invoices,...(data.settledInvoices||[])].find(i=>i.id===payment.invoiceId));
 const [account]=useState(()=>data.accounts.find(a=>a.id===payment.studentId));
 let effect:ReturnType<typeof paymentCancellation>|undefined,problem='';
 try{if(!invoice||!account)throw Error('연결된 청구·수강 정보를 찾을 수 없습니다. 새로고침 후 다시 확인해주세요.');effect=paymentCancellation(payment,invoice,account);}catch(e){problem=e instanceof Error?e.message:'수납 정보를 확인해주세요.';}
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance cancel-payment-dialog" aria-labelledby="cancel-payment-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}>
  <div className="section-head"><h2 id="cancel-payment-title">수납 취소</h2><CloseButton disabled={busy} onClick={close}/></div>
  <p><strong>{label}</strong></p><p>{paymentDay(payment)} · {payment.method} · <strong>{payment.amount.toLocaleString()}원</strong></p>
  <p className="quick-attendance-help">장부에 잘못 기록한 수납 완료를 되돌립니다. 카드 승인 취소나 실제 환불은 처리하지 않습니다.</p>
  {effect&&invoice&&account&&<div className="cancel-payment-summary"><p>취소 후 미납 금액 <strong>{(invoice.amount-effect.paid).toLocaleString()}원</strong></p><p>남은 횟수 <strong>{account.remaining}회 → {effect.remaining}회</strong></p><small>{effect.revertedUnits?`수납으로 추가했던 ${effect.revertedUnits}회를 되돌립니다. 기존 출석 기록은 유지됩니다.`:'이 수납으로 추가한 횟수가 없어 잔여 횟수는 유지됩니다.'}</small>{effect.remaining<0&&<small>이미 진행한 수업이 있어 잔여가 음수가 됩니다. 다시 수납하면 해당 횟수가 반영됩니다.</small>}</div>}
  <form onSubmit={async e=>{e.preventDefault();if(lock.current||!invoice||!account||problem)return;lock.current=true;setBusy(true);setError('');const form=new FormData(e.currentTarget);try{await save({action:'cancelPayment',paymentId:payment.id,expectedPaid:invoice.paid,expectedInvoiceUpdatedAt:invoice.updatedAt||'',expectedAccountUpdatedAt:account.updatedAt,reason:String(form.get('reason')||'')});close();}catch(err){setError(err instanceof Error?err.message:'수납을 취소하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>
   <label>취소 사유 (선택)<input name="reason" maxLength={500} placeholder="예: 미입금인데 수납 완료로 잘못 입력" disabled={busy}/></label>
   {(problem||error)&&<p className="error" role="alert">{problem||error}</p>}
   <button type="submit" className="danger-text" disabled={busy||Boolean(problem)}>{busy?'취소 중…':'수납 취소 확정'}</button>
  </form>
 </dialog>;
}
