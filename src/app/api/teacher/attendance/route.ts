import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { canViewPianoAttendance, koreaDay, pianoArrival, type PianoArrival, type PianoStudent } from '@/lib/teacher-attendance';
import { teacherCheckIn, correctTeacherAttendanceTime } from '@/lib/operations/service';
import { HttpError, sameOrigin } from '@/lib/operations/auth';
import { courseLifecycle, enrollmentState } from '@/lib/operations/lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
async function authorize(request: Request) {
  if (!adminAuth || !adminDb) throw new HttpError(503, '서버 연결 설정을 확인해주세요.');
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token, true)).uid; }
  catch { throw new HttpError(401, '다시 로그인해주세요.'); }
  const profile = (await adminDb.doc(`users/${uid}`).get()).data();
  if (!canViewPianoAttendance(profile)) throw new HttpError(403, '승인된 피아노 강사와 관리자만 사용할 수 있습니다.');
  return uid;
}
function failed(error: unknown) {
  return Response.json({ error: error instanceof HttpError ? error.message : '처리하지 못했습니다. 새로고침 후 다시 확인해주세요.' }, { status: error instanceof HttpError ? error.status : 500, headers });
}
export async function GET(request: Request) {
  try {
    await authorize(request); const db = adminDb!, day = koreaDay();
    const roster = new URL(request.url).searchParams.get('roster') === '1';
    const records = await db.collection('opsAttendance').where('day', '==', day)
      .select('studentId','day','source','status','arrivalAt','at','updatedAt').get();
    const candidates = records.docs.filter(doc => { const row = doc.data(); return ['kiosk','teacher'].includes(row.source) && ['present','makeup'].includes(row.status || 'present'); });
    const ids = [...new Set(candidates.map(doc=>doc.data().studentId).filter((id): id is string=>typeof id==='string' && /^[A-Za-z0-9_-]{1,160}$/.test(id)))];
    const fields = ['name','sourceStudentId','subject','displaySubject','attendanceGroup','active'];
    const accounts = roster ? (await db.collection('opsAccounts').where('active','==',true).select(...fields).get()).docs
      : ids.length ? await db.getAll(...ids.map(id=>db.doc(`opsAccounts/${id}`)), {fieldMask:fields}) : [];
    const accountById = new Map(accounts.map(doc=>[doc.id,doc.data()]));
    const ownerIds = [...new Set(accounts.filter(doc=>doc.exists).map(doc=>String(doc.data()?.sourceStudentId || doc.id)))].filter(id=>/^[A-Za-z0-9_-]{1,160}$/.test(id));
    const owners = ownerIds.length ? await db.getAll(...ownerIds.map(id=>db.doc(`students/${id}`)), {fieldMask:['name','instrument','instruments','operationsCourseGroups','lifecycle','courseLifecycles']}) : [];
    const ownerById = new Map(owners.map(doc=>[doc.id,doc.data()]));
    if (roster) {
      const arrived = new Set(candidates.map(doc=>doc.data().studentId));
      const students: PianoStudent[] = [];
      for (const doc of accounts) {
        const account = doc.data(), owner = ownerById.get(String(account?.sourceStudentId || doc.id));
        if (!account || !owner || enrollmentState(courseLifecycle(owner,doc.id)) !== 'active') continue;
        const row = pianoArrival(doc.id,{day,source:'teacher',studentId:doc.id,status:'present'},account,owner,day);
        if (row) students.push({id:doc.id,name:row.name,course:row.course,attended:arrived.has(doc.id)});
      }
      students.sort((a,b)=>a.name.localeCompare(b.name,'ko') || a.course.localeCompare(b.course,'ko'));
      return Response.json({day,students},{headers});
    }
    const arrivals = candidates.map(doc=>{const row=doc.data(),account=accountById.get(row.studentId);return pianoArrival(doc.id,row,account,ownerById.get(String(account?.sourceStudentId || row.studentId)),day);})
      .filter((row): row is PianoArrival=>row!==null).sort((a,b)=>(a.arrivalAt || 'z').localeCompare(b.arrivalAt || 'z') || a.name.localeCompare(b.name,'ko'));
    return Response.json({day,checkedAt:new Date().toISOString(),arrivals},{headers});
  } catch (error) { return failed(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const uid = await authorize(request), input = await request.json();
    if (input.action === 'checkIn') {
      const result = await teacherCheckIn(input, `teacher:${uid}`);
      return Response.json({ok:true,duplicate:result.duplicate},{headers});
    }
    if (input.action === 'correctTime') {
      await correctTeacherAttendanceTime(input, `teacher:${uid}`);
      return Response.json({ok:true},{headers});
    }
    throw new HttpError(400,'지원하지 않는 작업입니다.');
  } catch (error) { return failed(error); }
}
