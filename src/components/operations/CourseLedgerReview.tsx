'use client';
import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import type {CourseLedger} from '@/lib/operations/course-ledger';
import {CloseButton} from './CloseButton';
type Row=CourseLedger&{fingerprint:string};
export function CourseLedgerReview({user,save,close}:{user:User;save:(v:Record<string,unknown>)=>Promise<unknown>;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),lock=useRef(false);
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[message,setMessage]=useState('');
 async function load(){const r=await fetch('/api/operations/ledger',{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error);setRows(v.rows);}
 useEffect(()=>{ref.current?.showModal();void load().catch(e=>setError(e.message)).finally(()=>setBusy(false));},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function apply(row:Row){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await save({action:'reconcileCourseLedger',studentId:row.studentId,fingerprint:row.fingerprint});await load();setMessage(`${row.name}: 미납 수강권 연결을 정정했습니다. 출결·수납·잔여 횟수는 유지했습니다.`);}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
 return <dialog ref={ref} className="balance-review-dialog" aria-labelledby="course-ledger-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><div className="section-head"><div><h2 id="course-ledger-title">수강권·회차 점검</h2><p>각 수강권의 회차와 실제 수납을 대조합니다. 기존 수납과 출결은 보존합니다.</p></div><CloseButton disabled={busy} onClick={close}/></div>
 <p role="status">{busy?'확인 중… ':''}전체 {rows.length}건 · 연결 정정 가능 {rows.filter(r=>r.repair).length}건 · 추가 확인 {rows.filter(r=>r.issues.length&&!r.repair).length}건</p>
 <label>점검 학생 찾기<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="학생 이름"/></label>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
 <div className="table-wrap"><table><thead><tr><th>학생·과목</th><th>현재 잔여</th><th>원장 대조</th></tr></thead><tbody>{rows.filter(r=>r.name.includes(search.trim())).map(r=><tr key={r.studentId}><th>{r.name}</th><td>{r.currentRemaining}회{r.makeupOutstanding>0&&<small>이전 수강권 미완료 보강 {r.makeupOutstanding}회</small>}</td><td>{r.repair?<><p>{r.repair.start} · {r.repair.units}회권 · 미납 {r.repair.amount.toLocaleString()}원 연결 누락</p><p>잔여 {r.currentRemaining}회 유지 · 기존 수납·출결 유지</p><button disabled={busy} aria-label={`${r.name} 미납 수강권 연결 정정`} onClick={()=>void apply(r)}>미납 수강권 연결 정정</button></>:r.issues.length?<p>추가 확인 {r.issues.length}건</p>:<p>연결 대조 완료</p>}
 <details><summary>수강권별 회차·수납 근거</summary>{r.issues.map((text,n)=><p key={n}>{text}</p>)}{r.passes.map(p=><section key={p.id}><h3>{p.start} · {p.units}회권 · {{paid:'수납 완료',unpaid:'미납',partial:'부분 수납',review:'수납 연결 확인'}[p.paymentStatus]}</h3><p>수납 {p.paid.toLocaleString()} / {p.amount.toLocaleString()}원 · 수납 기록 {p.receiptIds.length}건</p><p>{p.slots.map(s=>`${s.ordinal}회: ${s.originDay||'날짜 미정'} ${ {unused:'예정',scheduled:'기록 확인',completed:'완료','makeup-due':'보강 대기'}[s.state]}${s.makeupDays.length?` / 보강 ${s.makeupDays.join(', ')}`:''}`).join(' · ')}</p></section>)}</details>
 </td></tr>)}</tbody></table></div></dialog>;
}
