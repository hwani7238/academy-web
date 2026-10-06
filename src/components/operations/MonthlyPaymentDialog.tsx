'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {type Snapshot,METHODS,seoulDay} from '@/lib/operations/model';
import {monthlyPaymentOptions} from '@/lib/operations/monthly-payment';
import {passUnitsOn} from '@/lib/operations/pass-history';
import {displayEnrollmentName} from '@/lib/operations/student-order';
import {CloseButton} from './CloseButton';
import {PaymentAmountInput} from './PaymentAmountInput';
export function MonthlyPaymentDialog({data,studentId,day,save,close}:{data:Snapshot;studentId:string;day:string;save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),requestId=useRef(crypto.randomUUID());
 const account=data.accounts.find(a=>a.id===studentId)!,student=data.students.find(s=>s.id===studentId)!;
 const options=useMemo(()=>monthlyPaymentOptions(data,studentId,day),[data,studentId,day]);
 const candidates=[...options.match,...options.unresolved];
 const [choice,setChoice]=useState(options.match[0]?.id||(options.unresolved.length===1?options.unresolved[0].id:options.unresolved.length?'':'new'));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const invoice=candidates.find(i=>i.id===choice),linkOnly=invoice?.status==='paid',units=invoice?.units||passUnitsOn(account,day);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance monthly-payment-dialog" aria-labelledby="monthly-payment-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><div><h2 id="monthly-payment-title">결제 확인·수납</h2><p>{displayEnrollmentName(student)}<br/>{day} · 1회차</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');const form=new FormData(e.currentTarget);try{await save({action:'monthlyPayment',studentId,lessonDate:day,invoiceId:invoice?.id||'',linkOnly,requestId:requestId.current,expectedUpdatedAt:account.updatedAt,expectedInvoiceUpdatedAt:invoice?.updatedAt||'',amount:Number(String(form.get('amount')||'0').replace(/,/g,'')),invoiceAmount:Number(String(form.get('invoiceAmount')||'0').replace(/,/g,'')),addUnits:form.get('addUnits')==='on',paymentDate:form.get('paymentDate'),method:form.get('method'),note:form.get('note')||''});close();}catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>
 {candidates.length>0&&<label>연결할 청구·수납<select aria-label="연결할 청구·수납" value={choice} required disabled={busy} onChange={e=>{setChoice(e.target.value);setError('');requestId.current=crypto.randomUUID();}}>{!choice&&<option value="">이 수강권에 해당하는 내역 선택</option>}{candidates.map(i=><option key={i.id} value={i.id}>{i.lessonDate||i.cycleStart||'날짜 미확인'} · {i.units}회 · {i.amount.toLocaleString()}원 · {i.status==='paid'?'수납 완료':'미납'}</option>)}{!options.match.length&&<option value="new">새 청구·수납 기록</option>}</select></label>}
 {choice&&<div key={choice}>{linkOnly?<p className="notice">이미 수납 완료된 {invoice!.amount.toLocaleString()}원 내역을 이 1회차에 연결합니다. 수납 금액과 남은 횟수를 다시 추가하지 않습니다.</p>:<>
 {!invoice&&<label>이 수강권의 원비 (원)<input name="invoiceAmount" inputMode="numeric" defaultValue={account.planAmount.toLocaleString()} required pattern="[0-9]+(,[0-9]{3})*"/></label>}
 {invoice&&<p>미납 금액 <strong>{(invoice.amount-invoice.paid).toLocaleString()}원</strong> · {units}회권</p>}
 <label>이번 수납 금액 (원)<PaymentAmountInput amount={invoice?invoice.amount-invoice.paid:account.planAmount}/></label>
 <label>결제받은 날짜<input name="paymentDate" type="date" defaultValue={seoulDay()} max={seoulDay()} required/></label>
 <label>결제 수단<select name="method">{METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
 {!invoice&&<label className="check"><input name="addUnits" type="checkbox" defaultChecked={day>seoulDay()}/>전액 수납 시 {units}회 추가<small>이미 잔여 횟수에 반영된 수강권이면 체크하지 마세요.</small></label>}
 {invoice&&<p className="subtle">{invoice.reservedPass?'예약한 첫 출석 때 횟수가 추가됩니다.':invoice.creditUnits===0?'이미 반영된 수강권으로, 수납해도 횟수를 추가하지 않습니다.':`전액 수납 시 ${invoice.creditUnits??invoice.units}회가 추가됩니다.`}</p>}
 <label>비고 (선택)<input name="note" maxLength={500} placeholder="입금자명 등"/></label>
 </>}</div>}
 {invoice?.needsReview&&<p className="error">청구·수납에서 청구 확인을 먼저 완료해주세요.</p>}
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy||!choice||invoice?.needsReview}>{busy?'저장 중…':linkOnly?'결제 완료 적용':'수납 확인·저장'}</button>
 </form></dialog>;
}
