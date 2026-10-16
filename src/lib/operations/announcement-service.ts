import { database, hash, HttpError } from './auth';
import { ANNOUNCEMENT_TEMPLATES, announcementInput, announcementRecipients, type Announcement, type TemplateState } from './announcements';
import { courseLifecycle } from './lifecycle';
import { enrollmentId, studentSubjects } from './service';
import type { Account, Snapshot } from './model';

export const announcementConfigured = () => Boolean(process.env.NHN_APP_KEY && process.env.NHN_SECRET_KEY && process.env.NHN_SENDER_KEY);
async function nhn(path:string, init: RequestInit = {}) {
  if(!announcementConfigured()) throw new HttpError(503,'NHN 알림톡 연결 설정이 필요합니다. 초안은 저장할 수 있습니다.');
  const response=await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${process.env.NHN_APP_KEY}${path}`,{...init,headers:{'Content-Type':'application/json;charset=UTF-8','X-Secret-Key':process.env.NHN_SECRET_KEY!,...init.headers},cache:'no-store',signal:AbortSignal.timeout(10000)});
  return {ok:response.ok,status:response.status,body:await response.json()};
}
export async function announcementTemplateState(code:string):Promise<TemplateState> {
  const expected=ANNOUNCEMENT_TEMPLATES.find(t=>t.code===code);
  if(!expected) throw Error('지원하지 않는 공지 양식입니다.');
  if(!announcementConfigured()) return {code,ready:false,reason:'NHN 연결 설정 필요'};
  try {
    const {ok,body}=await nhn(`/senders/${encodeURIComponent(process.env.NHN_SENDER_KEY!)}/templates/${code}`);
    const template=body.templates;
    if(!ok || body.header?.isSuccessful!==true || !template) return {code,ready:false,reason:'공지 템플릿 등록 또는 NHN 조회 권한 확인 필요'};
    if(template.status!=='TSC03' || template.block || template.dormant) return {code,ready:false,reason:template.dormant?'휴면 템플릿 · NHN 확인 필요':template.block?'사용 중지 템플릿':`카카오 승인 필요 (${template.statusName || template.status || '확인 중'})`};
    if(template.templateCode!==code || template.templateContent?.replace(/\r\n/g,'\n')!==expected.content || template.templateMessageType!=='BA' || template.templateEmphasizeType!=='NONE' || template.buttons?.length || template.quickReplies?.length || template.templateExtra || template.templateAd || template.templateTitle || template.templateHeader || template.templateImageUrl) return {code,ready:false,reason:'승인된 양식과 화면 양식이 다릅니다. 연결 확인이 필요합니다.'};
    return {code,ready:true,reason:'카카오 승인 확인 · 발송 가능'};
  } catch { return {code,ready:false,reason:'NHN 연결 확인 실패 · 잠시 후 다시 확인해주세요.'}; }
}
async function resolveRecipients(ids:string[]) {
  const db=database();
  const [people,accountDocs]=await Promise.all([db.collection('students').get(),db.collection('opsAccounts').get()]);
  const accounts=accountDocs.docs.map(d=>({...d.data(),id:d.id}) as Account);
  const accountMap=new Map(accounts.map(a=>[a.id,a]));
  const students:Snapshot['students']=people.docs.flatMap(d=>{
    const raw=d.data(); const base={name:String(raw.name||'학생'),phone:String(raw.phone||'')};
    if(accountMap.has(d.id)) return [{...base,id:d.id,lifecycle:courseLifecycle(raw,d.id)}];
    const subjects=[...new Set([...studentSubjects(raw),...accounts.filter(a=>a.sourceStudentId===d.id).map(a=>a.subject||'').filter(Boolean)])];
    if(!subjects.length) return [{...base,id:d.id,lifecycle:courseLifecycle(raw,d.id)}];
    return subjects.map(subject=>{const id=enrollmentId(d.id,subject);return {...base,id,name:`${base.name} · ${subject}`,lifecycle:courseLifecycle(raw,id)};});
  });
  return announcementRecipients(students,accounts,ids);
}
const docId=(value:unknown)=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw Error('공지 번호를 확인해주세요.');return value;};
export async function saveAnnouncement(input:Record<string,unknown>,actor:string) {
  const fields=announcementInput(input); const id=hash(`${actor}:${docId(input.requestId)}`); const ref=database().doc(`opsAnnouncements/${id}`);
  const audience=await resolveRecipients(fields.studentIds);
  if(!audience.recipients.length) throw Error('발송 가능한 휴대폰 번호가 없습니다. 학생 연락처를 확인해주세요.');
  const fingerprint=hash(JSON.stringify(fields));
  return database().runTransaction(async tx=>{
    const old=(await tx.get(ref)).data();
    if(old){if(old.fingerprint!==fingerprint)throw Error('내용이 변경되었습니다. 다시 미리보기를 저장해주세요.');return {id,...old} as Announcement;}
    const draft={...fields,...audience,status:'draft',createdAt:new Date().toISOString(),actor,fingerprint};
    tx.create(ref,draft);return {id,...draft} as Announcement;
  });
}
export async function getAnnouncement(id:unknown) {
  const key=docId(id);const data=(await database().doc(`opsAnnouncements/${key}`).get()).data();
  if(!data) throw new HttpError(404,'공지를 찾을 수 없습니다.');
  return {id:key,...data} as Announcement;
}
export async function sendAnnouncement(input:Record<string,unknown>,actor:string) {
  if(input.confirmed!==true)throw Error('내용과 발송 대상을 확인해주세요.');
  const draft=await getAnnouncement(input.id);
  if(draft.status!=='draft')return draft; // Repeat clicks and network retries never re-send.
  if(Date.now()-Date.parse(draft.createdAt)>24*60*60*1000)throw Error('저장한 지 하루가 지난 공지입니다. 현재 대상과 내용으로 다시 작성해주세요.');
  const state=await announcementTemplateState(draft.templateCode);
  if(!state.ready)throw Error(state.reason);
  const current=await resolveRecipients(draft.studentIds);
  if(JSON.stringify(current)!==JSON.stringify({recipients:draft.recipients,excluded:draft.excluded}))throw Error('학생 상태나 연락처가 변경되었습니다. 수정 후 다시 미리보기를 저장해주세요.');
  const db=database();const ref=db.doc(`opsAnnouncements/${draft.id}`);
  const claimed=await db.runTransaction(async tx=>{
    const fresh=(await tx.get(ref)).data();
    if(fresh?.status!=='draft')return false;
    tx.update(ref,{status:'processing',confirmedAt:new Date().toISOString(),confirmedBy:actor});return true;
  });
  if(!claimed)return getAnnouncement(draft.id);
  // A crash or uncertain response is retained for reconciliation, never blindly retried.
  let result:Record<string,unknown>;
  try {
    const {ok,status,body}=await nhn('/messages',{method:'POST',headers:{'X-NC-API-IDEMPOTENCY-KEY':draft.id},body:JSON.stringify({senderKey:process.env.NHN_SENDER_KEY,templateCode:draft.templateCode,senderGroupingKey:draft.id,recipientList:draft.recipients.map(r=>({recipientNo:r.phone,recipientGroupingKey:hash(r.phone),templateParameter:draft.parameters,resendParameter:{isResend:false}}))})});
    const requestId=body.message?.requestId;
    const results:Array<{recipientNo?:string;recipientGroupingKey?:string;resultCode:number}>=body.message?.sendResults || [];
    const recipients=draft.recipients.map(r=>{
      const found=results.filter(v=>v.recipientGroupingKey===hash(r.phone)||v.recipientNo===r.phone);
      const row=found.length===1?found[0]:undefined;
      const state=ok&&body.header?.isSuccessful===true&&requestId&&row ? row.resultCode===0?'submitted':'failed' : status<500&&body.header?.isSuccessful===false?'failed':'unknown';
      return {...r,status:state,resultCode:String(row?.resultCode??body.header?.resultCode??'')};
    });
    const state=recipients.every(r=>r.status==='submitted')?'submitted':recipients.every(r=>r.status==='failed')?'failed':recipients.every(r=>r.status==='unknown')?'unknown':'partial';
    result={status:state,recipients,requestId:typeof requestId==='string'?requestId:'',error:state==='submitted'?'':'수신자별 결과를 확인해주세요. 결과가 불명확한 건은 자동 재발송하지 않습니다.'};
  }catch{result={status:'unknown',error:'응답을 확인하지 못했습니다. NHN 발송 내역을 확인해주세요. 자동 재발송하지 않습니다.'};}
  await ref.update(result);return getAnnouncement(draft.id);
}
export async function refreshAnnouncement(id:unknown) {
  const draft=await getAnnouncement(id);
  if(!draft.requestId) return draft;
  const {ok,body}=await nhn(`/messages?requestId=${encodeURIComponent(draft.requestId)}&pageSize=1000`);
  if(!ok||body.header?.isSuccessful!==true)throw Error('NHN 결과를 조회하지 못했습니다. 잠시 후 다시 확인해주세요.');
  const messages:Array<{recipientNo:string;messageStatus:string;resultCode:string}>=body.messageSearchResultResponse?.messages||[];
  const recipients=draft.recipients.map(r=>{
    const matches=messages.filter(m=>m.recipientNo===r.phone);const m=matches.length===1?matches[0]:undefined;
    if(!m)return r;
    const status=m.messageStatus==='COMPLETED'&&m.resultCode==='MRC01'?'delivered':m.messageStatus==='FAILED'||m.resultCode==='MRC02'?'failed':m.messageStatus==='CANCEL'?'cancelled':r.status;
    return {...r,status,resultCode:m.resultCode};
  });
  const status=recipients.every(r=>r.status==='delivered')?'delivered':recipients.some(r=>['failed','unknown','cancelled'].includes(r.status||''))?'partial':'submitted';
  await database().doc(`opsAnnouncements/${draft.id}`).update({recipients,status});return getAnnouncement(draft.id);
}
