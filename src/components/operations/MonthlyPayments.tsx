'use client';
import {useEffect,useId,useMemo,useState} from 'react';
import {seoulDay,type Payment,type Snapshot} from '@/lib/operations/model';
import {paymentDay,courseInitial} from '@/lib/operations/billing-display';
import {monthlyPayments,paymentMonthBounds,receiptMethodGroup} from '@/lib/operations/payment-month';
import {CancelPaymentDialog} from './CancelPaymentDialog';
import {groupName} from '@/lib/operations/student-order';

const won=(amount:number)=>amount.toLocaleString('ko-KR')+'원';
export function MonthlyPayments({data,demo,busy,save}:{data:Snapshot;demo:boolean;busy:boolean;save:(input:Record<string,unknown>)=>Promise<unknown>}){
 const currentMonth=seoulDay().slice(0,7),tabsId=useId();
 const [month,setMonth]=useState(currentMonth),[method,setMethod]=useState('');
 const [result,setResult]=useState<{month:string;payments:Payment[]}|null>(null);
 const [cancelling,setCancelling]=useState<Payment|null>(null),[showCancelled,setShowCancelled]=useState(false);
 const [error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();
  setResult(null);setError('');
  void (async()=>{
   try{
    const {auth}=await import('@/lib/firebase-auth');
    const user=auth.currentUser;if(!user)throw Error('원장 계정으로 로그인해주세요.');
    const response=await fetch('/api/operations/payments?month='+encodeURIComponent(month),{
     cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+await user.getIdToken()}});
    const body=await response.json();
    if(!response.ok)throw Error(body.error||'수납 기록을 불러오지 못했습니다.');
    if(!controller.signal.aborted)setResult(body);
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'수납 기록을 불러오지 못했습니다.');}
  })();
  return()=>controller.abort();
 },[month,demo,data.payments,reload]);
 const loading=!demo&&!error&&result?.month!==month;
 const summary=useMemo(()=>monthlyPayments(demo?data.payments:result?.month===month?result.payments:[],month),[demo,data.payments,result,month]);
 const tabs=[{method:'',label:'전체 수납',amount:summary.total,count:summary.rows.length},...summary.methods.map(m=>({...m,label:m.method}))];
 const selectedTab=Math.max(0,tabs.findIndex(t=>t.method===method));
 const active=summary.rows.filter(p=>!method||receiptMethodGroup(p.method)===method);
 const visible=[...active,...(showCancelled?summary.cancelledRows.filter(p=>!method||receiptMethodGroup(p.method)===method):[])].sort((a,b)=>paymentDay(b).localeCompare(paymentDay(a))||b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 function move(offset:number){
  const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);
  setMonth(date.toISOString().slice(0,7));
 }
 function identity(id:string){
  const student=data.students.find(s=>s.id===id),account=data.accounts.find(a=>a.id===id);
  const name=student?.name||account?.name||'학생';
  return {name:name.split(' · ')[0],subject:student?groupName(student):account?.attendanceGroup||account?.subject||name.split(' · ')[1]||'과목 미지정'};
 }
 return <section aria-label="월별 수납 기록" className="monthly-payments">
  <div className="section-head billing-heading divided"><div><h2>월별 수납 기록</h2><p>실제 결제일 기준 · 부분 수납액 포함</p></div>
   <div className="payment-month-navigation"><button type="button" aria-label="이전 수납 월" onClick={()=>move(-1)}>‹</button>
    <label>조회 월<input type="month" value={month} max={currentMonth} onChange={e=>{if(e.target.value){paymentMonthBounds(e.target.value);setMonth(e.target.value);}}}/></label>
    <button type="button" aria-label="다음 수납 월" disabled={month>=currentMonth} onClick={()=>move(1)}>›</button>
    <button type="button" onClick={()=>setMonth(currentMonth)} disabled={month===currentMonth}>이번 달</button></div>
  </div>
  {error?<p className="error" role="alert">{error} <button type="button" onClick={()=>setReload(n=>n+1)}>다시 불러오기</button></p>:loading?<p className="empty billing-empty" role="status">{month} 수납 기록을 불러오고 있습니다…</p>:<>
   <div className="payment-summary" role="tablist" aria-label="수납 결제수단">
    {tabs.map((t,index)=><button type="button" role="tab" key={t.method} id={`${tabsId}-tab-${index}`} aria-controls={`${tabsId}-panel`} aria-selected={method===t.method} tabIndex={method===t.method?0:-1} className={method===t.method?'is-selected':''} onClick={()=>setMethod(t.method)} onKeyDown={e=>{
     const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;
     if(next<0)return;e.preventDefault();setMethod(tabs[next].method);document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}><span>{t.label} <small>{t.count}건</small></span><strong>{won(t.amount)}</strong></button>)}
   </div>
   <div className="payment-tab-panel" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${selectedTab}`} tabIndex={0}>
   <p className="payment-filter-total" role="status">{method||'전체 수단'} · {active.length}건 · {won(active.reduce((sum,p)=>sum+p.amount,0))}</p>
   {summary.cancelledRows.length>0&&<label className="check receipt-cancelled-toggle"><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/>취소 내역 보기 ({summary.cancelledRows.length})</label>}
   {visible.length?<div className="table-wrap"><table className="billing-table payment-table"><caption className="sr-only">{month} {method||'전체 수단'} 수납 기록</caption><thead><tr><th>결제일</th><th>과목</th><th>학생</th><th className="money">수납 금액</th><th>수단</th><th>비고</th><th>관리</th></tr></thead><tbody>{visible.map(p=>{const who=identity(p.studentId);return <tr key={p.id} className={p.cancelledAt?'receipt-cancelled':undefined}><td><time dateTime={paymentDay(p)} title={paymentDay(p)}>{Number(paymentDay(p).slice(5,7))}/{Number(paymentDay(p).slice(8))}</time></td><td><abbr title={who.subject}>{courseInitial(who.subject)}</abbr></td><td><strong>{who.name}</strong></td><td className="money">{won(p.amount)}</td><td>{p.method}</td><td className="billing-note">{p.note||'—'}{p.cancelledAt&&<small>{seoulDay(new Date(p.cancelledAt))} 취소{p.cancelReason?` · ${p.cancelReason}`:''}</small>}</td><td>{p.cancelledAt?<span className="receipt-cancelled-label">취소됨</span>:<button type="button" className="receipt-cancel-button" disabled={busy} aria-label={`${who.name} ${paymentDay(p)} ${p.amount.toLocaleString()}원 수납 취소`} onClick={()=>setCancelling(p)}>수납 취소</button>}</td></tr>;})}</tbody></table></div>:<p className="empty billing-empty">선택한 월과 결제수단의 수납 기록이 없습니다.</p>}
   </div>
  </>}
 {cancelling&&<CancelPaymentDialog payment={cancelling} data={data} label={`${identity(cancelling.studentId).name} · ${identity(cancelling.studentId).subject}`} save={async input=>{await save(input);setReload(n=>n+1);}} close={()=>setCancelling(null)}/>}
 </section>;
}
