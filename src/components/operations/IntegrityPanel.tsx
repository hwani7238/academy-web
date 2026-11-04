'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import type {IntegrityIssue} from '@/lib/operations/billing-integrity';
type Result={checked:number;checkedAt:string;lastFullAt:string;lastFullDay:string;lastScopedAt:string;issues:IntegrityIssue[];error:string;scheduledConfigured:boolean;monthlyStale:boolean;monthly:null|{month:string;checkedAt:string;amount:number;receiptCount:number;byMethod:Record<string,number>;issues:IntegrityIssue[]};notification:null|{key:string;at:string;count:number}};
const time=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
export function IntegrityPanel({user,revision}:{user:User;revision:string}){
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const running=useRef(false);
 const load=useCallback(async(manual=false)=>{if(running.current)return;running.current=true;if(manual)setBusy(true);try{const response=await fetch('/api/operations/integrity',{method:manual?'POST':'GET',headers:{Authorization:`Bearer ${await user.getIdToken()}`},signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw Error(data.error||'점검 결과를 불러오지 못했습니다.');setResult(data);setError('');}catch(e){setError(e instanceof Error?e.message:'점검 결과를 불러오지 못했습니다.');}finally{running.current=false;if(manual)setBusy(false);}},[user]);
 useEffect(()=>{void load();const focus=()=>void load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[load]);
 // Read the single saved report after a change; never start a full scan on mount,
 // revision changes, or a browser timer. Domain mutations validate their own course.
 useEffect(()=>{const timer=setTimeout(()=>void load(),2500),followup=setTimeout(()=>void load(),8000);return()=>{clearTimeout(timer);clearTimeout(followup);};},[revision,load]);
 const priority:Record<string,number>={'scan-failed':0,'attendance-missing':1,'ledger-missing':0,'missing-invoice':1,'duplicate-invoice':1,'wrong-pass':1,'missing-student':2,'unlinked-invoice':3,'receipt-link':3,'no-pass-start':4,'balance-review':5};
 const visible=[...(result?.issues||[])].filter(i=>!search||i.name.includes(search)).sort((a,b)=>(priority[a.kind]??4)-(priority[b.kind]??4)||a.name.localeCompare(b.name,'ko')||a.day.localeCompare(b.day));
 return <section className="surface" aria-label="출석·청구 자동 점검" style={{margin:'12px 0',padding:16}}>
  <div className="section-head"><div><h2>출석·청구 자동 점검</h2><p>{result?.checkedAt?`${result.checked}개 수강 설정 점검 · 확인 필요 ${new Set(result.issues.map(i=>i.studentId)).size}개 수강 설정`:'저장된 점검 결과가 아직 없습니다.'}</p><small>{busy?'전체 점검 중':result?.scheduledConfigured?'매일 23:30 자동 점검 · 변경한 학생은 즉시 검증':'매일 23:30 자동 점검 · 서버 예약 설정 확인 필요'}</small></div><button disabled={busy} onClick={()=>void load(true)}>지금 다시 점검</button></div>
  {(error||result?.error)&&<p role="alert">점검 확인 필요: {error||result?.error} 기존 점검 결과는 유지됩니다.</p>}
  {result&&!result.scheduledConfigured&&<p role="alert">자동 점검 실행을 위한 서버 인증 설정이 필요합니다. 설정 전에는 지금 다시 점검을 이용해주세요.</p>}
  {!!result?.notification?.count&&<p role="alert" key={result.notification.key}>관리자 확인 필요: {result.notification.count}건 · 아래 점검 결과를 확인해주세요.</p>
  {!!result?.issues.length&&<details><summary>확인이 필요한 학생과 사유 보기 ({result.issues.length}건)</summary><p role="status">관리자 확인 필요 · 실제 오류와 과거 기록의 근거 부족 항목을 함께 표시합니다. 출결과 수납을 임의로 변경하지 않습니다.</p><label>점검 학생 찾기<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="학생 이름"/></label><div className="table-wrap"><table><thead><tr><th>학생</th><th>수업일</th><th>확인할 내용</th></tr></thead><tbody>{visible.map((i,n)=><tr key={`${i.studentId}-${i.kind}-${i.day}-${n}`}><td>{i.name}</td><td>{i.day||'미확인'}</td><td>{i.reason}</td></tr>)}</tbody></table></div></details>}
  {result?.lastFullAt&&<p><small>마지막 전체 점검: {time(result.lastFullAt)} · 출결 확인 기준 {result.lastFullDay}</small></p>}
  {result?.lastScopedAt&&<p><small>최근 변경 항목 점검: {time(result.lastScopedAt)}</small></p>}
  <small>한국 시간 기준 · 점검은 실제 청구 생성·수납 처리와 별도로 실행됩니다.</small>
  {result?.monthly&&<details><summary>{result.monthly.month} 월말 정산 검증{result.monthlyStale?' · 변경 후 재점검 대기':` · 확인 필요 ${result.monthly.issues.length}건`}</summary><p>수납 {result.monthly.receiptCount}건 · {result.monthly.amount.toLocaleString()}원</p><p>{Object.entries(result.monthly.byMethod).map(([method,amount])=>`${method} ${amount.toLocaleString()}원`).join(' · ')}</p>{result.monthly.issues.map((i,n)=><p key={n}>{i.name} · {i.day} · {i.reason}</p>)}<small>검증 시각 {time(result.monthly.checkedAt)} · 취소·중복 제외 처리된 수납은 합계에서 제외됩니다.</small></details>}
 </section>;
}
