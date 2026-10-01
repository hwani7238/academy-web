'use client';
import { CloseButton } from './CloseButton';
import {useEffect,useRef,useState} from 'react';
import {Account,seoulDay} from '@/lib/operations/model';
import {displayCourseName} from '@/lib/operations/student-order';
export function InvoiceDialog({account,save,close}:{account:Account;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);const [kind,setKind]=useState('next'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance registration-dialog" aria-labelledby="invoice-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><h2 id="invoice-title">{displayCourseName(account.name)} · 청구 등록</h2><CloseButton disabled={busy} onClick={close} /></div><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);const f=Object.fromEntries(new FormData(e.currentTarget));try{await save({...f,action:kind!=='next'?'currentCycleInvoice':'invoice',kind,studentId:account.id,expectedUpdatedAt:account.updatedAt});close();}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{lock.current=false;setBusy(false);}}}>
 <p>{account.planUnits}회권 · {account.planAmount.toLocaleString('ko-KR')}원 · 현재 잔여 {account.remaining}회</p>
 <label>청구 구분<select value={kind} onChange={e=>setKind(e.target.value)}><option value="next">다음 수강권 결제</option><option value="first">신규 등록한 첫 수강권 미납</option><option value="current">이미 시작한 수강권 미납</option></select></label>
 {kind!=='next'&&<label>1회차 시작일{kind==='first'?' (선택)':''}<input name="cycleStart" type="date" max={kind==='current'?seoulDay():undefined} required={kind==='current'}/>{kind==='first'&&<small>아직 정해지지 않았다면 비워두세요. 청구 목록에 날짜 미확인으로 표시됩니다.</small>}</label>}
 <p>{kind!=='next'?'현재 잔여 횟수를 유지하며, 수납해도 횟수를 다시 추가하지 않습니다. 결제 안내는 발송하지 않습니다.':`전액 수납 시 ${account.planUnits}회가 추가됩니다.`}</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'저장 중…':'청구 등록'}</button>
 </form></dialog>;
}
