import { database, manager, sameOrigin, failure } from '@/lib/operations/auth';
import { ANNOUNCEMENT_TEMPLATES } from '@/lib/operations/announcements';
import { announcementConfigured, announcementTemplateState, getAnnouncement, saveAnnouncement, sendAnnouncement, refreshAnnouncement } from '@/lib/operations/announcement-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request) {
  try {
    await manager(request);
    const id=new URL(request.url).searchParams.get('id');
    if(id)return Response.json(await getAnnouncement(id),{headers:{'Cache-Control':'no-store'}});
    const [templates,history]=await Promise.all([Promise.all(ANNOUNCEMENT_TEMPLATES.map(t=>announcementTemplateState(t.code))),database().collection('opsAnnouncements').orderBy('createdAt','desc').limit(30).get()]);
    return Response.json({configured:announcementConfigured(),templates,history:history.docs.map(d=>{const a=d.data();return {id:d.id,title:a.title,status:a.status,createdAt:a.createdAt,count:a.recipients.length};})},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    sameOrigin(request);const actor=await manager(request);const input=await request.json();
    switch(input.action){
      case 'save':return Response.json(await saveAnnouncement(input,actor));
      case 'send':return Response.json(await sendAnnouncement(input,actor));
      case 'refresh':return Response.json(await refreshAnnouncement(input.id));
      default:throw Error('지원하지 않는 작업입니다.');
    }
  }catch(error){return failure(error);}
}
