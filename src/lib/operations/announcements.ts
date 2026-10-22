import type { Snapshot } from './model';
import { enrollmentState } from './lifecycle';

export const ANNOUNCEMENT_TEMPLATES = [
  { code: 'WHEE_NOTICE_CLOSED', name: '휴강·휴무 안내', content: '[휘뮤직 수업 안내]\n재원생 및 보호자님께 수업 운영 변경을 안내드립니다.\n\n대상: #{대상}\n휴강 기간: #{기간}\n휴강 사유: #{사유}\n수업 재개: #{재개일}\n\n수강 일정에 참고 부탁드립니다.', fields: ['대상', '기간', '사유', '재개일'] },
  { code: 'WHEE_NOTICE_SCHEDULE', name: '수업 일정 변경', content: '[휘뮤직 수업 일정 변경]\n재원생 및 보호자님께 신청하신 수업의 일정 변경을 안내드립니다.\n\n대상 수업: #{대상}\n기존 일정: #{기존일정}\n변경 일정: #{변경일정}\n변경 사유: #{사유}\n\n변경된 일정에 맞춰 등원 부탁드립니다.', fields: ['대상', '기존일정', '변경일정', '사유'] },
  { code: 'WHEE_NOTICE_LOCATION', name: '수업 장소 변경', content: '[휘뮤직 수업 장소 변경]\n재원생 및 보호자님께 신청하신 수업의 장소 변경을 안내드립니다.\n\n대상 수업: #{대상}\n적용 일정: #{기간}\n기존 장소: #{기존장소}\n변경 장소: #{변경장소}\n\n변경된 장소로 등원 부탁드립니다.', fields: ['대상', '기간', '기존장소', '변경장소'] },
] as const;
export type AnnouncementTemplate = typeof ANNOUNCEMENT_TEMPLATES[number];
export type TemplateState = { code: string; ready: boolean; reason: string };
export type Recipient = { phone: string; names: string[]; ids: string[]; status?: string; resultCode?: string };
export type Announcement = { id: string; title: string; templateCode: string; parameters: Record<string,string>; content: string; studentIds: string[]; recipients: Recipient[]; excluded: { name: string; reason: string }[]; status: string; createdAt: string; actor: string; requestId?: string; confirmedAt?: string; error?: string };
export const ANNOUNCEMENT_STATUS: Record<string,string> = { draft:'발송 전 · 보관', processing:'처리 중 · 결과 확인', submitted:'NHN 접수', partial:'일부 실패·확인 필요', failed:'접수 실패', unknown:'결과 확인 필요', delivered:'전달 완료', cancelled:'취소', demo:'체험 완료' };
export function announcementInput(input: Record<string,unknown>) {
  const template = ANNOUNCEMENT_TEMPLATES.find(t=>t.code===input.templateCode);
  if (!template) throw Error('공지 양식을 선택해주세요.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length>80) throw Error('관리용 제목을 80자 이내로 입력해주세요.');
  const values = input.parameters as Record<string,unknown> | undefined;
  const parameters: Record<string,string> = {};
  for (const field of template.fields) {
    const value = values && typeof values[field]==='string' ? String(values[field]).trim() : '';
    if (!value || value.length>150 || /#\{|https?:\/\//i.test(value)) throw Error(`${field} 항목을 150자 이내로 입력해주세요. 링크와 치환 기호는 사용할 수 없습니다.`);
    parameters[field]=value;
  }
  const content = renderAnnouncement(template,parameters);
  if(content.length>1000) throw Error('공지 내용은 1,000자 이내여야 합니다.');
  if(!Array.isArray(input.studentIds) || !input.studentIds.length || input.studentIds.length>500 || input.studentIds.some(id=>typeof id!=='string'||!id||id.length>200||id.includes('/'))) throw Error('발송 대상을 1~500건 선택해주세요.');
  const studentIds = [...new Set(input.studentIds as string[])].sort();
  return {title,templateCode:template.code,parameters,content,studentIds};
}
export function renderAnnouncement(template: AnnouncementTemplate, parameters: Record<string,string>) {
  return template.content.replace(/#\{([^}]+)\}/g, (_,key)=>parameters[key] || `【${key}】`);
}
// Common notices only: no student-specific data is substituted into a shared phone's message.
export function announcementRecipients(students: Snapshot['students'], accounts: Snapshot['accounts'], ids: string[]) {
  const byId = new Map(students.map(s=>[s.id,s])); const accountById = new Map(accounts.map(a=>[a.id,a]));
  const recipients = new Map<string,Recipient>(); const excluded: Announcement['excluded'] = [];
  for(const id of [...new Set(ids)].sort()) {
    const student=byId.get(id); const account=accountById.get(id);
    if(!student) throw Error('학생 정보가 변경되었습니다. 대상을 다시 선택해주세요.');
    const name=student.name;
    if(enrollmentState(student.lifecycle)!=='active') { excluded.push({name,reason:'휴원·퇴원 과목'}); continue; }
    const phone=String(account?.phone ?? student.phone ?? '').replace(/\D/g,'');
    if(!/^01[016789]\d{7,8}$/.test(phone)) { excluded.push({name,reason:'알림 받을 휴대폰 번호 확인 필요'}); continue; }
    const recipient=recipients.get(phone)||{phone,names:[],ids:[]}; recipient.names.push(name);recipient.ids.push(id);recipients.set(phone,recipient);
  }
  return { recipients:[...recipients.values()].sort((a,b)=>a.phone.localeCompare(b.phone)), excluded };
}
