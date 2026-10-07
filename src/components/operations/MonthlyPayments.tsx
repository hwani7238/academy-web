'use client';
import {useEffect,useMemo,useState} from 'react';
import {seoulDay,type Payment,type Snapshot} from '@/lib/operations/model';
import {paymentDay,courseInitial} from '@/lib/operations/billing-display';
import {monthlyPayments,paymentMonthBounds} from '@/lib/operations/payment-month';
import {groupName} from '@/lib/operations/student-order';

const won=(amount:number)=>amount.toLocaleString('ko-KR')+'원';
export function MonthlyPayments({data,demo}:{data:Snapshot;demo:boolean}){
 const currentMonth=seoulDay().slice(0,7);
 const [month,setMonth]=useState(currentMonth),[method,setMethod]=useState('');
 const [result,setResult]=useState<{month:string;payments:Payment[]}|null>(null);
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
 const visible=summary.rows.filter(p=>!method||p.method===method);
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
   <label>결제수단<select value={method} onChange={e=>setMethod(e.target.value)}><option value="">전체 수단</option>{summary.methods.map(m=><option key={m.method} value={m.method}>{m.method}</option>)}</select></label>
  </div>
  {error?<p className="error" role="alert">{error} <button type="button" onClick={()=>setReload(n=>n+1)}>다시 불러오기</button></p>:loading?<p className="empty billing-empty" role="status">{month} 수납 기록을 불러오고 있습니다…</p>:<>
   <div className="payment-summary" aria-label="월별 수납 합계"><button type="button" className={method===''?'is-selected':''} aria-pressed={method===''} onClick={()=>setMethod('')}><span>{month} 총 수납액</span><strong>{won(summary.total)}</strong><small>{summary.rows.length}건</small></button>
    {summary.methods.map(m=><button type="button" key={m.method} className={method===m.method?'is-selected':''} aria-pressed={method===m.method} onClick={()=>setMethod(method===m.method?'':m.method)}><span>{m.method}</span><strong>{won(m.amount)}</strong><small>{m.count}건</small></button>)}</div>
   <p className="payment-filter-total" role="status">{method||'전체 수단'} · {visible.length}건 · {won(visible.reduce((sum,p)=>sum+p.amount,0))}</p>
   {visible.length?<div className="table-wrap"><table className="billing-table payment-table"><caption className="sr-only">{month} {method||'전체 수단'} 수납 기록</caption><thead><tr><th>결제일</th><th>과목</th><th>학생</th><th className="money">수납 금액</th><th>수단</th><th>비고</th></tr></thead><tbody>{visible.map(p=>{const who=identity(p.studentId);return <tr key={p.id}><td><time dateTime={paymentDay(p)}>{paymentDay(p)}</time></td><td><abbr title={who.subject}>{courseInitial(who.subject)}</abbr></td><td><strong>{who.name}</strong></td><td className="money">{won(p.amount)}</td><td>{p.method}</td><td className="billing-note">{p.note||'—'}</td></tr>;})}</tbody></table></div>:<p className="empty billing-empty">선택한 월과 결제수단의 수납 기록이 없습니다.</p>}
  </>}
 </section>;
}
