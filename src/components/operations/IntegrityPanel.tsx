'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import type {IntegrityIssue} from '@/lib/operations/billing-integrity';
type Result={checked:number;checkedAt:string;issues:IntegrityIssue[];repaired:{name:string;day:string}[]};
export function IntegrityPanel({user,onRepaired,revision}:{user:User;onRepaired:()=>void;revision:string}){
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const running=useRef(false),changed=useRef(onRepaired);changed.current=onRepaired;
 const scan=useCallback(async()=>{if(running.current)return;running.current=true;setBusy(true);try{const response=await fetch('/api/operations/integrity',{method:'POST',headers:{Authorization:`Bearer ${await user.getIdToken()}`},signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw Error(data.error||'점검에 실패했습니다.');setResult(data);setError('');if(data.repaired.length)changed.current();}catch(e){setError(e instanceof Error?e.message:'점검에 실패했습니다.');}finally{running.current=false;setBusy(false);}},[user]);
 useEffect(()=>{void scan();const timer=setInterval(()=>void scan(),60000);return()=>clearInterval(timer);},[scan]);
 useEffect(()=>{const timer=setTimeout(()=>void scan(),1000);return()=>clearTimeout(timer);},[revision,scan]);
 const visible=result?.issues.filter(i=>!search||i.name.includes(search))||[];
 return <section className="surface" aria-label="출석·청구 자동 점검" style={{margin:'12px 0',padding:16}}>
  <div className="section-head"><div><h2>출석·청구 자동 점검</h2><p>{result?`${result.checked}개 수강 설정 점검 · 확인 필요 ${new Set(result.issues.map(i=>i.studentId)).size}개 수강 설정`:'출석과 청구 연결을 확인하고 있습니다.'} · {busy?'점검 중':'1분마다 자동 확인'}</p></div><button disabled={busy} onClick={()=>void scan()}>지금 다시 점검</button></div>
  {error&&<p role="alert">자동 점검 실패: {error} 기존 경고는 유지됩니다.</p>}
  {!!result?.repaired.length&&<p role="status">자동 복구: {result.repaired.map(r=>`${r.name} ${r.day}`).join(', ')}</p>}
  {!!result?.issues.length&&<details><summary>확인이 필요한 학생과 사유 보기 ({result.issues.length}건)</summary><p>이 목록은 오류 확정 목록이 아닙니다. 과거 수납·보강·이관 근거가 부족한 경우 임의 변경하지 않고 표시합니다.</p><label>점검 학생 찾기<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="학생 이름"/></label><div className="table-wrap"><table><thead><tr><th>학생</th><th>수업일</th><th>확인할 내용</th></tr></thead><tbody>{visible.map((i,n)=><tr key={`${i.studentId}-${i.kind}-${i.day}-${n}`}><td>{i.name}</td><td>{i.day||'미확인'}</td><td>{i.reason}</td></tr>)}</tbody></table></div></details>}
  {result&&<small>마지막 확인: {new Date(result.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}. 실제 납부 금액·결제일·수단은 자동 변경하지 않습니다.</small>}
 </section>;
}
