'use client';
import {useEffect,useRef,useState} from 'react';
import {type Account,seoulDay} from '@/lib/operations/model';
import {CloseButton} from './CloseButton';
export function PassHistoryDialog({account,save,close}:{account:Account;save:(input:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);
 const [rows,setRows]=useState(account.passHistory?.length?account.passHistory.map(r=>({...r})):[{start:'',units:account.planUnits}]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="quick-attendance" aria-labelledby="pass-history-title" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}><div className="section-head"><div><h2 id="pass-history-title">수강권 이력</h2><p>{account.name} · 현재 {account.planUnits}회권</p></div><CloseButton disabled={busy} onClick={close}/></div><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await save({action:'savePassHistory',studentId:account.id,history:rows,expectedUpdatedAt:account.updatedAt});close();}catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>
 <p className="subtle">수강권마다 1회차 시작일과 등록 횟수를 입력하세요. 해당 날짜부터 회차를 1로 다시 표시합니다.</p>
 {rows.map((r,i)=><div className="pass-history-row" key={i}><label>1회차 시작일<input type="date" aria-label={`${i+1}번째 수강권 시작일`} max={seoulDay()} value={r.start} required disabled={busy} onInput={e=>{const value=e.currentTarget.value;setRows(v=>v.map((row,n)=>n===i?{...row,start:value}:row));}}/></label><label>등록 횟수<input type="number" aria-label={`${i+1}번째 수강권 횟수`} min="1" max="200" value={r.units||''} required disabled={busy} onInput={e=>{const value=Number(e.currentTarget.value);setRows(v=>v.map((row,n)=>n===i?{...row,units:value}:row));}}/></label><button type="button" className="ops-close-button" aria-label={`${i+1}번째 이력 삭제`} disabled={busy||rows.length===1} onClick={()=>setRows(v=>v.filter((_,n)=>n!==i))}>×</button></div>)}
 <button type="button" disabled={busy||rows.length>=60} onClick={()=>setRows(v=>[...v,{start:'',units:account.planUnits}])}>＋ 수강권 이력 추가</button>
 <p className="subtle">출결표 회차의 기준을 정정합니다. 남은 횟수·수강료·수납 기록은 유지됩니다. 마지막 이력은 현재 {account.planUnits}회권과 맞춰주세요.</p>
 {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'저장 중…':'수강권 이력 저장'}</button></form></dialog>;
}
