'use client';
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Snapshot } from '@/lib/operations/model';
import { enrollmentState } from '@/lib/operations/lifecycle';
import { GROUPS, groupName, compareGroups, compareStudents, displayEnrollmentName } from '@/lib/operations/student-order';
import { ANNOUNCEMENT_TEMPLATES, ANNOUNCEMENT_STATUS, announcementInput, announcementRecipients, renderAnnouncement, type Announcement, type TemplateState } from '@/lib/operations/announcements';
type History = {id:string;title:string;status:string;createdAt:string;count:number};
const when=(v:string)=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const mask=(v:string)=>`${v.slice(0,3)}-****-${v.slice(-4)}`;
export function Announcements({user,data,demo}:{user:User|null;data:Snapshot;demo:boolean}) {
  const [templates,setTemplates]=useState<TemplateState[]>([]);const [history,setHistory]=useState<History[]>([]);
  const [code,setCode]=useState<string>(ANNOUNCEMENT_TEMPLATES[0].code);const [title,setTitle]=useState('');const [parameters,setParameters]=useState<Record<string,string>>({});
  const [group,setGroup]=useState('');const [search,setSearch]=useState('');const [selected,setSelected]=useState<string[]>([]);
  const [draft,setDraft]=useState<Announcement|null>(null);const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  const requestId=useRef('');const locked=useRef(false);const demos=useRef(new Map<string,Announcement>());
  const template=ANNOUNCEMENT_TEMPLATES.find(t=>t.code===code)!;
  const state=templates.find(t=>t.code===(draft?.templateCode||code));
  const active=data.students.filter(s=>enrollmentState(s.lifecycle)==='active').sort(compareStudents);
  const groups=[...new Set([...GROUPS,...active.map(groupName)])].sort(compareGroups);
  const visible=active.filter(s=>(!group||groupName(s)===group)&&(!search||s.name.includes(search)));
  const selectedExisting=selected.filter(id=>data.students.some(s=>s.id===id));
  const audience=announcementRecipients(data.students,data.accounts,selectedExisting);
  async function api(body?:Record<string,unknown>,id?:string){
    if(!user)throw Error('원장 계정으로 로그인해주세요.');
    const r=await fetch(`/api/operations/announcements${id?`?id=${encodeURIComponent(id)}`:''}`,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${await user.getIdToken()}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await r.json();if(!r.ok)throw Error(result.error||'처리하지 못했습니다.');return result;
  }
  async function reload(){
    if(demo){setTemplates(ANNOUNCEMENT_TEMPLATES.map(t=>({code:t.code,ready:false,reason:'체험용 양식 · 실제 발송 없음'})));return;}
    const result=await api();setTemplates(result.templates);setHistory(result.history);
  }
  useEffect(()=>{void reload().catch(e=>setError(e.message));},[user,demo]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(task:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(e instanceof Error?e.message:'처리하지 못했습니다.');}finally{locked.current=false;setBusy(false);}}
  function changed(){requestId.current='';setConfirmed(false);}
  function addHistory(a:Announcement){setHistory(h=>[{id:a.id,title:a.title,status:a.status,createdAt:a.createdAt,count:a.recipients.length},...h.filter(v=>v.id!==a.id)].slice(0,30));}
  async function save(){
    const input={templateCode:code,title,parameters,studentIds:selected};
    if(!requestId.current)requestId.current=crypto.randomUUID();
    let next:Announcement;
    if(demo){const fields=announcementInput(input);if(!audience.recipients.length)throw Error('발송 가능한 대상을 선택해주세요.');next={...fields,...audience,id:requestId.current,status:'draft',createdAt:new Date().toISOString(),actor:'demo'};demos.current.set(next.id,next);}
    else next=await api({action:'save',...input,requestId:requestId.current});
    setDraft(next);setConfirmed(false);addHistory(next);setMessage('초안을 저장했습니다. 내용과 수신 대상을 최종 확인해주세요. 아직 발송하지 않았습니다.');
  }
  async function send(){
    if(!draft||!confirmed)return;
    const next:Announcement=demo?{...draft,status:'demo'}:await api({action:'send',id:draft.id,confirmed:true});
    if(demo)demos.current.set(next.id,next);
    setDraft(next);setConfirmed(false);addHistory(next);setMessage(demo?'체험을 완료했습니다. 실제 메시지는 보내지 않았습니다.':'발송 요청 결과를 확인해주세요. NHN 접수는 전달 완료와 다릅니다.');
  }
  function edit(a:Announcement){setDraft(null);setTitle(a.title);setCode(a.templateCode);setParameters(a.parameters);setSelected(a.studentIds);changed();}
  return <div className="announcements">
    <div className="section-head"><div><h2>카카오 공지</h2><p>필요한 수업 안내를 작성하고, 원장님 확인 후 학부모·수강생에게 개별 발송합니다.</p></div><button disabled={busy} onClick={()=>void run(reload)}>승인 상태·내역 새로고침</button></div>
    <p className="notice">수업 운영에 필요한 안내만 보내주세요. 특강 모집·할인 등 광고는 알림톡으로 보낼 수 없습니다. 휴원·퇴원 과목은 제외하고 공통 공지는 같은 연락처에 한 번만 보냅니다.</p>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success" role="status">{message}</p>}
    {!draft?<div className="announcement-grid"><form className="announcement-form" onSubmit={e=>{e.preventDefault();void run(save);}}>
      <h3>1. 공지 작성</h3>
      <label>관리용 제목<input required maxLength={80} placeholder="예: 10월 휴강 안내" value={title} onChange={e=>{setTitle(e.target.value);changed();}}/><small>학부모에게는 아래 미리보기 내용만 전달됩니다.</small></label>
      <label>공지 양식<select value={code} onChange={e=>{setCode(e.target.value);setParameters({});changed();}}>{ANNOUNCEMENT_TEMPLATES.map(t=><option key={t.code} value={t.code}>{t.name}</option>)}</select></label>
      <p className={state?.ready?'success':'notice'}>{state?.reason||'템플릿 승인 상태를 확인하고 있습니다. 초안 작성은 가능합니다.'}</p>
      {template.fields.map(field=><label key={field}>{field}<input required maxLength={150} value={parameters[field]||''} placeholder={field==='대상'?'예: 어린이 피아노 1관 재원생':field==='사유'?'예: 공휴일 휴강':field.includes('일정')||field==='기간'||field==='재개일'?'예: 10월 9일 (금)':''} onChange={e=>{setParameters(p=>({...p,[field]:e.target.value}));changed();}}/></label>)}
      <details><summary>템플릿 등록 안내</summary><p>NHN Cloud의 알림톡 템플릿 관리에서 아래 코드와 문구를 기본형·강조 없음·버튼 없음으로 등록해 카카오 심사를 받아주세요. 승인 전에는 실제 발송할 수 없습니다.</p><code>{template.code}</code><pre>{template.content}</pre><button type="button" onClick={()=>void run(async()=>{await navigator.clipboard.writeText(`코드: ${template.code}\n이름: ${template.name}\n\n${template.content}`);setMessage('등록용 코드와 문구를 복사했습니다.');})}>등록 문구 복사</button></details>
      <h3>2. 발송 대상</h3>
      <div className="announcement-filters"><label>과목·관<select value={group} onChange={e=>setGroup(e.target.value)}><option value="">전체 과목</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label>학생 찾기<input value={search} placeholder="이름" onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="row-actions"><button type="button" onClick={()=>{setSelected(visible.map(s=>s.id));changed();}}>현재 목록 전체 선택 ({visible.length}건)</button><button type="button" onClick={()=>{setSelected([]);changed();}}>선택 해제</button></div>
      <p>{selected.length}개 수강 선택 · 중복 제외 <strong>{audience.recipients.length}개 연락처</strong> · 제외 {audience.excluded.length}건</p>
      <div className="announcement-students">{visible.map(s=><label className="check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>{setSelected(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id));changed();}}/>{displayEnrollmentName(s)}</label>)}</div>
      <button className="primary" disabled={busy||!audience.recipients.length}>{busy?'저장 중…':'초안 저장·최종 확인'}</button>
    </form><aside className="announcement-preview"><h3>학부모에게 보이는 내용</h3><div className="kakao-preview"><strong>휘뮤직 · 알림톡</strong><pre>{renderAnnouncement(template,parameters)}</pre></div><p className="subtle">수신자의 카카오톡 화면에 따라 표시 모양은 달라질 수 있습니다. 문자 대체 발송은 사용하지 않습니다.</p></aside></div>:<div className="announcement-review">
      <div className="section-head"><div><h3>{draft.title}</h3><p>{ANNOUNCEMENT_STATUS[draft.status]||draft.status} · {when(draft.createdAt)}</p></div><button disabled={busy} onClick={()=>{setDraft(null);setConfirmed(false);setMessage('');}}>작성 화면</button></div>
      <div className="announcement-grid"><div><div className="kakao-preview"><strong>휘뮤직 · 알림톡</strong><pre>{draft.content}</pre></div><p>{state?.reason||'승인 상태 확인 필요'}</p>{draft.error&&<p className="error">{draft.error}</p>}
        {draft.status==='draft'?<><p><strong>{draft.recipients.length}개 연락처</strong>에 같은 내용으로 개별 발송합니다.</p><label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>수신 대상과 내용을 확인했으며, 광고가 아닌 필요한 수업 안내입니다.</label><div className="row-actions"><button disabled={busy} onClick={()=>edit(draft)}>수정 후 다시 확인</button><button className="primary" disabled={busy||!confirmed||(!demo&&!state?.ready)} onClick={()=>void run(send)}>{busy?'처리 중…':demo?'체험 발송 (실제 전송 없음)':`${draft.recipients.length}건 알림톡 발송`}</button></div><small>발송에는 NHN 이용료가 발생합니다. 승인 전 초안은 저장만 되며, 자동으로 발송되지 않습니다.</small></>:<><p>이미 요청한 공지는 다시 발송하지 않습니다. NHN 접수 후 전달 결과를 조회할 수 있습니다.</p>{draft.requestId&&<><small>요청 번호: {draft.requestId}</small><button disabled={busy} onClick={()=>void run(async()=>{const next=await api({action:'refresh',id:draft.id});setDraft(next);addHistory(next);})}>전달 결과 조회</button></>}</>}
      </div><div><h3>수신 대상 {draft.recipients.length}건</h3><div className="table-wrap announcement-recipients"><table><thead><tr><th>학생·과목</th><th>연락처</th><th>상태</th></tr></thead><tbody>{draft.recipients.map(r=><tr key={r.phone}><td>{r.names.join(', ')}</td><td>{mask(r.phone)}</td><td>{ANNOUNCEMENT_STATUS[r.status||'draft']||r.status}{r.resultCode&&<small>{r.resultCode}</small>}</td></tr>)}</tbody></table></div>{draft.excluded.length>0&&<details><summary>제외된 수강 {draft.excluded.length}건</summary>{draft.excluded.map((r,i)=><p key={i}>{r.name} · {r.reason}</p>)}</details>}</div></div>
    </div>}
    <div className="section-head divided"><h3>저장한 공지·발송 내역</h3><small>최근 30건 · 초안은 자동 발송되지 않습니다.</small></div>
    {history.length?<div className="table-wrap"><table><thead><tr><th>저장일</th><th>제목</th><th>수신 연락처</th><th>상태</th><th>확인</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{when(h.createdAt)}</td><td>{h.title}</td><td>{h.count}건</td><td>{ANNOUNCEMENT_STATUS[h.status]||h.status}</td><td><button disabled={busy} onClick={()=>void run(async()=>{const next=demo?demos.current.get(h.id):await api(undefined,h.id);if(next){setDraft(next);setConfirmed(false);}})}>내용·대상 보기</button></td></tr>)}</tbody></table></div>:<p className="empty">아직 저장한 공지가 없습니다.</p>}
  </div>;
}
