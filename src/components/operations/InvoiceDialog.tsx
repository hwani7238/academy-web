'use client';
import {useEffect,useRef,useState} from 'react';
import {Account,seoulDay} from '@/lib/operations/model';
import {displayCourseName} from '@/lib/operations/student-order';
export function InvoiceDialog({account,save,close}:{account:Account;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);const [kind,setKind]=useState('next'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance registration-dialog" aria-labelledby="invoice-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><h2 id="invoice-title">{displayCourseName(account.name)} · 청구 등록</h2><button disabled={busy} onClick={close}>닫기</button></div><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);const f=Object.fromEntries(new FormData(e.currentTarget));try{await save({...f,action:kind==='current'?'currentCycleInvoice':'invoice',studentId:account.id,expectedUpdatedAt:account.updatedAt});close();}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{lock.current=false;setBusy(false);}}}>
 <p>{account.planUnits}회권 · {account.planAmount.toLocaleString('ko-KR')}원 · 현재 잔여 {account.remaining}회</p>
 <label>청구 구분<select value={kind} onChange={e=>setKind(e.target.value)}><option value="next">다음 수강권 결제</option><option value="current">이미 시작한 수강권 미납</option></select></label>
 {kind==='current'&&<label>재등록일 (1회차 시작일)<input name="cycleStart" type="date" max={seoulDay()} required/></label>}
 <p>{kind==='current'?'현재 잔여 횟수를 유지하며, 수납해도 횟수를 다시 추가하지 않습니다. 결제 안내는 발송하지 않습니다.':`전액 수납 시 ${account.planUnits}회가 추가됩니다.`}</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'저장 중…':'청구 등록'}</button>
 </form></dialog>;
}
