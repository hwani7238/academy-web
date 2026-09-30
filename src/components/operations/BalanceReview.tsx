'use client';
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import type {BalanceReview as Row} from '@/lib/operations/balance-review';
import {CloseButton} from './CloseButton';
export function BalanceReview({user,save,close}:{user:User;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[filter,setFilter]=useState('all');
 async function load(){const r=await fetch('/api/operations/balances',{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error);setRows(v.rows);}
 useEffect(()=>{ref.current?.showModal();void load().catch(e=>setError(e.message)).finally(()=>setBusy(false));},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function apply(){if(lock.current)return;lock.current=true;setBusy(true);setError('');let count=0;
  try{for(const r of rows.filter(r=>r.status==='correct')){await save({action:'correctRemaining',studentId:r.id,requestId:crypto.randomUUID(),remaining:r.expected,expectedRemaining:r.current,expectedUpdatedAt:r.updatedAt,reconciliationFingerprint:r.fingerprint,note:`잔여 전체 점검: ${r.reason}. ${r.current}→${r.expected}회. 출결 중복 차감 없이 잔여만 정정.`});count++;setMessage(`${count}건 정정 완료`);}await load();setMessage(`${count}건 정정 완료. 변경 사유와 이전 잔여를 기록했습니다.`);}
  catch(e){setError(`${count}건 처리 후 중단: ${e instanceof Error?e.message:'저장 실패'}`);await load().catch(()=>{});}finally{lock.current=false;setBusy(false);}
 }
 const candidates=rows.filter(r=>r.status==='correct');
 return <dialog ref={ref} className="balance-review-dialog" aria-labelledby="balance-review-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><div className="section-head"><div><h2 id="balance-review-title">잔여 횟수 점검</h2><p>과목별 이관·출결·수납·직접 정정 내역을 대조합니다. 근거가 불명확한 항목은 수정하지 않습니다.</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <p role="status">{busy?'확인 중… ':''}전체 {rows.length}건 · 정정 가능 {candidates.length}건 · 추가 확인 {rows.filter(r=>r.status==='review').length}건 · 일치/직접 정정 확인 {rows.filter(r=>['verified','confirmed'].includes(r.status)).length}건</p>
 <div className="row-actions"><label>표시<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체</option><option value="correct">정정 가능</option><option value="review">추가 확인</option><option value="confirmed">직접 정정 확인</option><option value="verified">일치</option></select></label><button disabled={busy||!candidates.length} onClick={()=>void apply()}>확인된 {candidates.length}건 잔여 정정</button><button disabled={busy} onClick={()=>{setBusy(true);void load().catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>다시 점검</button></div>
 {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <div className="table-wrap"><table><thead><tr><th>학생·과목</th><th>현재</th><th>대조 결과</th><th>근거</th></tr></thead><tbody>{rows.filter(r=>filter==='all'||r.status===filter).map(r=><tr key={r.id} data-balance-status={r.status}><th>{r.name}<small>{r.group}</small></th><td>{r.current}회</td><td>{r.status==='correct'?`${r.expected}회로 정정`:r.status==='review'?'추가 확인':r.status==='confirmed'?'직접 정정 확인':'일치'}</td><td>{r.reason}<details><summary>계산 근거 보기</summary><pre>{JSON.stringify(r.evidence,null,2)}</pre></details></td></tr>)}</tbody></table></div></dialog>;
}
