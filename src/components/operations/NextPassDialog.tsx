'use client';
import {useEffect,useRef,useState} from 'react';
import {type Account,type Invoice,seoulDay} from '@/lib/operations/model';
import {CloseButton} from './CloseButton';
import {PassHistoryDialog} from './PassHistoryDialog';
const won=(n:number)=>n.toLocaleString('ko-KR');
export function NextPassDialog({account,invoices,save,close}:{account:Account;invoices:Invoice[];save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false),next=account.nextPass;
 const [history,setHistory]=useState(false),[units,setUnits]=useState(next?.units||account.planUnits),[amount,setAmount]=useState(won(next?.amount||account.planAmount));
 const [mode,setMode]=useState<'depleted'|'date'>(next?.mode||'depleted'),[start,setStart]=useState(next?.start||seoulDay()),[note,setNote]=useState(next?.note||'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const paid=!!invoices.find(i=>i.id===next?.invoiceId)?.paid;
 useEffect(()=>{if(!history)ref.current?.showModal();},[history]);
 async function submit(cancel=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await save({action:'saveNextPass',studentId:account.id,expectedUpdatedAt:account.updatedAt,units,amount:Number(amount.replace(/,/g,'')),mode,start,note,cancel});close();}catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
 if(history)return <PassHistoryDialog account={account} save={save} close={()=>setHistory(false)}/>;
 return <dialog ref={ref} className="quick-attendance" aria-labelledby="next-pass-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><div><h2 id="next-pass-title">수강권 관리</h2><p>{account.name}</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <p className="pass-current">현재 {account.planUnits}회 · {won(account.planAmount)}원 <strong>잔여 {account.remaining}회</strong></p>
 <form onSubmit={e=>{e.preventDefault();void submit();}}><h3>다음 수강권 {next?'예약 변경':'예약'}</h3><div className="next-pass-fields"><label>다음 등록 횟수<input aria-label="다음 등록 횟수" type="number" min="1" max="200" value={units||''} disabled={busy||paid} required onInput={e=>setUnits(Number(e.currentTarget.value))}/></label><label>다음 수강료 (원)<input aria-label="다음 수강료" inputMode="numeric" value={amount} disabled={busy||paid} required onInput={e=>{const n=e.currentTarget.value.replace(/[^0-9]/g,'');setAmount(n?won(Number(n)):'');}}/></label></div>
 <label>적용 시점<select aria-label="적용 시점" value={mode} disabled={busy||paid} onChange={e=>setMode(e.target.value as typeof mode)}><option value="depleted">현재 잔여 횟수 소진 후 첫 출석</option><option value="date">지정일 이후 첫 출석</option></select></label>
 {mode==='date'&&<label>적용 시작일<input aria-label="적용 시작일" type="date" min={seoulDay()} value={start} disabled={busy||paid} required onInput={e=>setStart(e.currentTarget.value)}/><small>지정일 이후 첫 출석을 1회차로 시작합니다. 이전 잔여 횟수는 이월됩니다.</small></label>}
 <label>비고 (선택)<input value={note} disabled={busy||paid} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="예: 11월부터 주 3회"/></label>
 <p className="subtle">예약하면 청구·수납에 다음 수강료가 별도로 등록됩니다. 결제 안내는 원장 확인 후 보내세요. 선납해도 새 횟수는 적용 시점에 한 번만 추가됩니다. 보강·결석은 예약을 시작하지 않습니다.</p>
 {paid&&<p className="subtle">예약 수강권은 수납 내역이 있어 변경·취소할 수 없습니다. 예약한 시점에 자동 적용됩니다.</p>}
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="next-pass-actions">{next&&<button type="button" disabled={busy||paid} onClick={()=>void submit(true)}>예약 취소</button>}<button className="primary" disabled={busy||paid}>{busy?'저장 중…':next?'예약 변경 저장':'다음 수강권 예약'}</button></div></form>
 <button type="button" className="quiet pass-history-link" disabled={busy} onClick={()=>setHistory(true)}>이전 수강권 이력 수정</button></dialog>;
}
