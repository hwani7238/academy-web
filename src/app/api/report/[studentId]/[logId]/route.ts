import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { feedbackStaff, feedbackViewed, FeedbackError } from '@/lib/feedback/policy';

interface RouteContext { params: Promise<{studentId:string;logId:string}> }
const pickPublicLog=(data:FirebaseFirestore.DocumentData)=>({
  studentName:data.studentName??'학생',progress:data.progress??'',feedback:data.feedback??'',createdAt:data.createdAt??null,
  mediaUrl:data.mediaUrl??null,mediaType:data.mediaType??null,mediaTitle:data.mediaTitle??null,
  textbookImageUrl:data.textbookImageUrl??null,additionalTextbookImageUrl:data.additionalTextbookImageUrl??null,
  textbookImages:Array.isArray(data.textbookImages)?data.textbookImages:[],mediaFiles:Array.isArray(data.mediaFiles)?data.mediaFiles:[],
});
async function readReport(request:Request,context:RouteContext,legacyPost=false) {
  if (!adminDb) return Response.json({error:'Server configuration error'},{status:503});
  try {
    const {studentId,logId}=await context.params;
    if (![studentId,logId].every(id=>id&&!id.includes('/')&&id.length<=160)) throw new FeedbackError('Invalid path');
    const token=new URL(request.url).searchParams.get('t');
    if (!token) throw new FeedbackError('Missing token',401);
    let staffUid:string|undefined;
    const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try { staffUid=(await adminAuth!.verifyIdToken(bearer,true)).uid; }
      catch { throw new FeedbackError('Invalid staff token',401); }
    }
    const ref=adminDb.doc(`students/${studentId}/logs/${logId}`);
    const report=await adminDb.runTransaction(async tx=>{
      const snap=await tx.get(ref),data=snap.data();
      if (!data) throw new FeedbackError('Not found',404);
      if (data.reportToken!==token) throw new FeedbackError('Forbidden',403);
      let preview=false;
      if (staffUid) {
        const profile=(await tx.get(adminDb!.doc(`users/${staffUid}`))).data();
        preview=feedbackStaff({uid:staffUid,role:profile?.role,status:profile?.status});
        if (!preview) throw new FeedbackError('Forbidden',403);
      }
      // Lock the exact content before returning it. A concurrent teacher edit
      // either commits first and is read here, or retries and finds it viewed.
      if (!preview && (!legacyPost || !feedbackViewed(data))) {
        tx.update(ref,{viewed:true,lastViewedAt:FieldValue.serverTimestamp(),lastViewedUserAgent:request.headers.get('user-agent')?.slice(0,300)||'unknown',viewCount:(typeof data.viewCount==='number'?data.viewCount:0)+1,...(!data.firstViewedAt?{firstViewedAt:FieldValue.serverTimestamp()}:{})});
      }
      return pickPublicLog(data);
    });
    return Response.json(legacyPost?{ok:true}:{ok:true,report},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if (error instanceof FeedbackError) return Response.json({error:error.message},{status:error.status});
    console.error('Report read failed',error);
    return Response.json({error:'Unable to read report'},{status:500});
  }
}
export const GET=(request:Request,context:RouteContext)=>readReport(request,context);
// Old already-open clients still post a view event. It must not count twice.
export const POST=(request:Request,context:RouteContext)=>readReport(request,context,true);
