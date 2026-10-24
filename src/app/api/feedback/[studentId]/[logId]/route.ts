import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { feedbackEdit, FeedbackError } from '@/lib/feedback/policy';

export async function PATCH(request: Request, context: {params: Promise<{studentId:string;logId:string}>}) {
  if (!adminAuth || !adminDb) return Response.json({error:'서버 설정을 확인해주세요.'},{status:503});
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) return Response.json({error:'잘못된 요청입니다.'},{status:403});
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({error:'로그인이 필요합니다.'},{status:401});
  let uid:string;
  try { uid=(await adminAuth.verifyIdToken(token,true)).uid; }
  catch { return Response.json({error:'다시 로그인해주세요.'},{status:401}); }
  try {
    const {studentId,logId}=await context.params;
    if (![studentId,logId].every(id=>id && !id.includes('/') && id.length<=160)) throw new FeedbackError('잘못된 피드백 주소입니다.');
    const input=await request.json();
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new FeedbackError('잘못된 수정 내용입니다.');
    const ref=adminDb.doc(`students/${studentId}/logs/${logId}`);
    const revision=await adminDb.runTransaction(async tx=>{
      const [log,user]=await Promise.all([tx.get(ref),tx.get(adminDb!.doc(`users/${uid}`))]);
      if (!log.exists) throw new FeedbackError('피드백을 찾을 수 없습니다.',404);
      const before=log.data()!,profile=user.data();
      const patch=feedbackEdit(before,{uid,role:profile?.role,status:profile?.status},input);
      tx.update(ref,{...patch,editedAt:FieldValue.serverTimestamp(),editedBy:uid});
      tx.create(ref.collection('edits').doc(),{before:{progress:before.progress||'',feedback:before.feedback||''},after:patch,actor:uid,at:FieldValue.serverTimestamp()});
      return patch.editRevision;
    });
    return Response.json({ok:true,revision},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if (error instanceof FeedbackError) return Response.json({error:error.message},{status:error.status});
    if (error instanceof SyntaxError) return Response.json({error:'잘못된 수정 내용입니다.'},{status:400});
    console.error('Feedback edit failed',error);
    return Response.json({error:'저장하지 못했습니다. 잠시 후 다시 시도해주세요.'},{status:500});
  }
}
