'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {type Snapshot,METHODS,seoulDay} from '@/lib/operations/model';
import {monthlyPaymentOptions} from '@/lib/operations/monthly-payment';
import {passUnitsOn} from '@/lib/operations/pass-history';
import {displayEnrollmentName} from '@/lib/operations/student-order';
import {PassPaymentSummary} from './PassPaymentSummary';
import {InvoiceReviewPanel} from './InvoiceReviewPanel';
import {CloseButton} from './CloseButton';
import {PaymentAmountInput} from './PaymentAmountInput';
export function MonthlyPaymentDialog({data,studentId,day:initialDay,initialInvoiceId,save,close}:{data:Snapshot;studentId:string;day:string;initialInvoiceId?:string;save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),requestId=useRef(crypto.randomUUID());
 const account=data.accounts.find(a=>a.id===studentId)!,student=data.students.find(s=>s.id===studentId)!;
 const [day,setDay]=useState(initialDay);
 const options=useMemo(()=>monthlyPaymentOptions(data,studentId,day),[data,studentId,day]);
 const selectedInvoice=[...data.invoices,...(data.settledInvoices||[])].find(i=>i.id===initialInvoiceId&&i.studentId===studentId&&i.status!=='cancelled');
 const candidates=initialInvoiceId?(selectedInvoice?[selectedInvoice]:[]):[...new Map([...options.match,...options.unresolved].map(i=>[i.id,i])).values()];
 const [choice,setChoice]=useState(initialInvoiceId||(options.match.length===1?options.match[0].id:options.match.length?'':options.unresolved.length===1?options.unresolved[0].id:options.unresolved.length?'':'new'));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const invoice=candidates.find(i=>i.id===choice),linkOnly=invoice?.status==='paid',units=invoice?.units||passUnitsOn(account,day);
 const chooseAllocation=!invoice||(!invoice.reservedPass&&invoice.allocationState!=='allocated'&&(!invoice.passId?invoice.creditUnits!==0:true));
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance monthly-payment-dialog" aria-labelledby="monthly-payment-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><div><h2 id="monthly-payment-title">수강권 연결·수납</h2><p>{displayEnrollmentName(student)}<br/>{day?`${day} · 1회차`:'1회차 날짜를 입력해주세요'}</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <form onSubmit={async e=>{e.preventDefault();if(lock.current)return;if(choice!=='new'&&!invoice){setError('선택한 청구가 변경됐습니다. 창을 닫고 다시 열어주세요.');return;}lock.current=true;setBusy(true);setError('');const form=new FormData(e.currentTarget);try{await save({action:'monthlyPayment',studentId,lessonDate:day,invoiceId:invoice?.id||'',linkOnly,requestId:requestId.current,expectedUpdatedAt:account.updatedAt,expectedInvoiceUpdatedAt:invoice?.updatedAt||'',amount:Number(String(form.get('amount')||'0').replace(/,/g,'')),invoiceAmount:Number(String(form.get('invoiceAmount')||'0').replace(/,/g,'')),addUnits:false,passAllocation:form.get('passAllocation'),paymentDate:form.get('paymentDate'),method:form.get('method'),note:form.get('note')||''});close();}catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>
 {initialInvoiceId&&<label>이 수강권의 1회차 날짜<input type="date" required value={day} disabled={busy} onChange={e=>{setDay(e.target.value);setError('');}}/><small>결제받은 날짜와 별개인 첫 수업일입니다. 과거 날짜도 입력할 수 있습니다.</small></label>}
 {candidates.length>0&&<label>연결할 청구·수납<select aria-label="연결할 청구·수납" value={choice} required disabled={busy} onChange={e=>{setChoice(e.target.value);setError('');requestId.current=crypto.randomUUID();}}>{!choice&&<option value="">이 수강권에 해당하는 내역 선택</option>}{candidates.map(i=><option key={i.id} value={i.id}>{i.lessonDate||i.cycleStart||'1회차 날짜 미등록'} · {i.units}회권 · 청구 {i.amount.toLocaleString()}원 / 수납 {i.paid.toLocaleString()}원 · 등록 {i.createdAt.slice(0,10)}</option>)}</select></label>}
 {choice!=='new'&&!invoice&&<p className="error" role="alert">선택한 청구가 변경됐습니다. 창을 닫고 다시 열어주세요.</p>}
 {choice&&day&&!linkOnly&&<p className="notice">선택한 내역을 {day} 1회차에 연결하고 수납을 함께 저장합니다. 내역이 여러 개라면 회차·금액·등록일을 확인해 선택해주세요.</p>}
 {choice&&!invoice?.needsReview&&<div key={choice}>{linkOnly?<p className="notice">이미 수납 완료된 {invoice!.amount.toLocaleString()}원 내역을 이 1회차에 연결합니다. 수납 금액과 남은 횟수를 다시 추가하지 않습니다.</p>:<>
 {!invoice&&<label>이 수강권의 원비 (원)<input name="invoiceAmount" inputMode="numeric" defaultValue={account.planAmount.toLocaleString()} required pattern="[0-9]+(,[0-9]{3})*"/></label>}
 {invoice&&<p>미납 금액 <strong>{(invoice.amount-invoice.paid).toLocaleString()}원</strong> · {units}회권</p>}
 <label>이번 수납 금액 (원)<PaymentAmountInput amount={invoice?invoice.amount-invoice.paid:account.planAmount}/></label>
 <label>결제받은 날짜<input name="paymentDate" type="date" defaultValue={seoulDay()} max={seoulDay()} required/></label>
 <label>결제 수단<select name="method">{METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
 {chooseAllocation&&<label>이 수강권의 횟수 반영 방법<select name="passAllocation" required defaultValue={day>seoulDay()||!!invoice?.passId&&!invoice.linkReview?'pending':''}><option value="" disabled>현재 잔여에 포함됐는지 선택해주세요</option><option value="already">이미 포함됨 · {account.remaining}회 유지</option><option value="activate">아직 포함 안 됨 · {units}회 추가 ({account.remaining}회 → {account.remaining+units}회)</option><option value="pending">선납 · 지금은 유지, 첫 출석 때 {units}회 추가</option></select><small>예전에 받은 수강권 횟수가 현재 잔여에 포함돼 있다면 ‘이미 포함됨’을 선택하세요. 한 번 반영한 횟수는 재저장·분할 수납·수납 취소 시 다시 추가하지 않습니다.</small></label>}
 {!chooseAllocation&&(invoice?.passId?<PassPaymentSummary invoice={invoice} account={account}/>:<p className="notice">이미 반영된 수강권입니다. 수납 후에도 잔여 {account.remaining}회를 유지합니다.</p>)}
 <label>비고 (선택)<input name="note" maxLength={500} placeholder="입금자명 등"/></label>
 </>}</div>}
 {invoice?.needsReview&&<InvoiceReviewPanel invoice={invoice} save={save} cancelled={close} onBusyChange={value=>{lock.current=value;setBusy(value);}}/>}
 {error&&<p className="error" role="alert">{error}</p>}{!invoice?.needsReview&&<button className="primary" disabled={busy||!choice||!day||(choice!=='new'&&!invoice)}>{busy?'저장 중…':linkOnly?'기존 수납 연결 · 금액·횟수 유지':'수강권 연결·수납 저장'}</button>}
 </form></dialog>;
}

