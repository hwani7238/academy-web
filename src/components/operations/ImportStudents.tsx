'use client';
import {compareNames} from '@/lib/operations/student-order';
import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
type Row={status:string;id:string;name:string;subject:string;sourceRow:number;planUnits:number|null;planAmount:number|null;remainingCandidate:number|null;issues:string[];historyCount:number;matchedStudentId:string|null;attendanceRevision:number;attendanceAsOf:string};
export function ImportStudents({user}:{user:User|null}){
 const [rows,setRows]=useState<Row[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function call(body?:unknown){if(!user)throw Error('로그인이 필요합니다.');const r=await fetch('/api/operations/import',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${await user.getIdToken()}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error);return v;}
 async function refresh(){try{setRows((await call()).rows);}catch(e){setMessage(e instanceof Error?e.message:'불러오기 실패');}}
 useEffect(()=>{void refresh();},[user]); // eslint-disable-line react-hooks/exhaustive-deps
 async function refreshAttendance(file:File){
  setBusy(true);let done=0;let skipped=0;
  try{
   const v=JSON.parse(await file.text());
   if(v.version!==2||!Array.isArray(v.history))throw Error('출결 갱신용 자료를 선택해주세요.');
   const current:Row[]=(await call()).rows;
   const key=(name:string,subject:string)=>`${name.replace(/\s+|님$/g,'')}|${subject}`;
   const groups=new Map<string,typeof v.history>();
   for(const h of v.history){const k=key(h.name,h.subject);groups.set(k,[...(groups.get(k)||[]),h]);}
   for(const row of current){
    const k=key(row.name,row.subject);const history=groups.get(k);
    if(!history||history.length!==1||current.filter(r=>key(r.name,r.subject)===k).length!==1){skipped++;continue;}
    await call({action:'refresh-attendance',month:v.month,asOf:v.asOf,rows:[{id:row.id,revision:row.attendanceRevision,history}]});
    done++;setMessage(`출결 원본 ${done}건 갱신 중 · 미일치 ${skipped}건`);
   }
   await refresh();setMessage(`${v.asOf}까지 출결 원본 ${done}건 갱신 완료 · 미일치 ${skipped}건은 기존 자료 유지. 수강권 잔액과 직접 입력한 출석은 변경하지 않았습니다.`);
  }catch(e){setMessage(`출결 ${done}건 처리 후 중단: ${e instanceof Error?e.message:'갱신 실패'}. 같은 파일로 다시 시도할 수 있습니다.`);}
  finally{setBusy(false);}
 }
 async function upload(file:File){setBusy(true);try{const v=JSON.parse(await file.text());if(v.version!==1||!Array.isArray(v.rows))throw Error('이관용 자료를 선택해주세요.');for(let i=0;i<v.rows.length;i+=5){await call({...v,rows:v.rows.slice(i,i+5)});setMessage(`${Math.min(i+5,v.rows.length)} / ${v.rows.length}건 보관 완료`);}await refresh();setMessage(`${v.rows.length}건을 가져왔습니다. 잔여 후보는 원본과 대조 후 수강권에 반영하세요.`);}catch(e){setMessage(e instanceof Error?e.message:'가져오기 실패');}finally{setBusy(false);}}
 async function activate(){setBusy(true);let done=0;let skipped=0;try{for(const row of rows.filter(r=>r.status!=='activated'&&r.matchedStudentId&&r.remainingCandidate!==null&&r.issues.every(v=>v==='잔여 후보 확인 필요'))){try{await call({action:'activate',id:row.id});done++;}catch{skipped++;}setMessage(`수강권 ${done}건 반영 · ${skipped}건 추가 확인`);}await refresh();setMessage(`수강권 ${done}건 반영 완료 · 과목 등 추가 확인 ${skipped}건`);}finally{setBusy(false);}}
 return <><div className="section-head"><div><h2>기존 장부 가져오기</h2><p>학생·수강료·회차 후보와 과거 출결 원본을 보관합니다. 확인 전에는 차감·청구·알림을 발생시키지 않습니다.</p></div><label>이관 자료 선택<input type="file" accept=".json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/></label></div><label>출결 원본 갱신<input type="file" accept=".json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void refreshAttendance(f);}}/></label><p>최신 출결 기준일: {rows.map(r=>r.attendanceAsOf).filter(Boolean).sort().at(-1)||'없음'} · 원본 갱신은 잔액을 차감하지 않습니다.</p><p role="status">{message}</p><button disabled={busy} onClick={()=>void activate()}>일치한 수강권 반영</button><p>반영 {rows.filter(r=>r.status==='activated').length}건 · 보관 {rows.length}건 · 기존 학생 연결 {rows.filter(r=>r.matchedStudentId).length}건</p><div className="table-wrap"><table><thead><tr><th>학생·과목</th><th>수강권</th><th>수강료</th><th>잔여 후보</th><th>출결 원본</th><th>확인 사항</th></tr></thead><tbody>{[...rows].sort((a,b)=>compareNames(a.name,b.name)||a.sourceRow-b.sourceRow).map(r=><tr key={r.id}><td>{r.name}<small>{r.subject||'과목 확인 필요'} · 원본 {r.sourceRow}행</small></td><td>{r.planUnits===null?'미기재':`${r.planUnits}회`}</td><td>{r.planAmount===null?'미기재':`${r.planAmount.toLocaleString()}원`}</td><td>{r.remainingCandidate===null?'확인 필요':`${r.remainingCandidate}회 (미확정)`}</td><td>{r.historyCount}개 월별 행</td><td>{r.status==='activated'?'수강권 반영 완료':r.issues.join(' · ')}</td></tr>)}</tbody></table></div></>;
}
