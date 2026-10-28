import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { canViewPianoAttendance, koreaDay, pianoArrival, type PianoArrival } from '@/lib/teacher-attendance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers });

export async function GET(request: Request) {
  if (!adminAuth || !adminDb) return error('서버 연결 설정을 확인해주세요.', 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error('로그인이 필요합니다.', 401);
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token, true)).uid; }
  catch { return error('다시 로그인해주세요.', 401); }
  try {
    const profile = (await adminDb.doc(`users/${uid}`).get()).data();
    if (!canViewPianoAttendance(profile)) return error('승인된 피아노 강사와 관리자만 조회할 수 있습니다.', 403);
    // Date and subject scope are chosen by the server, never by request parameters.
    const day = koreaDay();
    const records = await adminDb.collection('opsAttendance').where('day', '==', day)
      .select('studentId', 'day', 'source', 'status', 'arrivalAt', 'at').get();
    const candidates = records.docs.filter(doc => { const row = doc.data(); return row.source === 'kiosk' && ['present', 'makeup'].includes(row.status || 'present'); });
    const ids = [...new Set(candidates.map(doc => doc.data().studentId).filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/')))];
    const accounts = ids.length ? await adminDb.getAll(...ids.map(id => adminDb!.doc(`opsAccounts/${id}`)), {
      fieldMask: ['name', 'sourceStudentId', 'subject', 'displaySubject', 'attendanceGroup'],
    }) : [];
    const accountById = new Map(accounts.map(doc => [doc.id, doc.data()]));
    const ownerIds = [...new Set(accounts.filter(doc => doc.exists).map(doc => String(doc.data()?.sourceStudentId || doc.id)))].filter(id => id && !id.includes('/'));
    const owners = ownerIds.length ? await adminDb.getAll(...ownerIds.map(id => adminDb!.doc(`students/${id}`)), {
      fieldMask: ['name', 'instrument', 'instruments', 'operationsCourseGroups'],
    }) : [];
    const ownerById = new Map(owners.map(doc => [doc.id, doc.data()]));
    const arrivals = candidates.map(doc => {
      const row = doc.data(), account = accountById.get(row.studentId);
      return pianoArrival(doc.id, row, account, ownerById.get(String(account?.sourceStudentId || row.studentId)), day);
    }).filter((row): row is PianoArrival => row !== null)
      .sort((a, b) => (a.arrivalAt || 'z').localeCompare(b.arrivalAt || 'z') || a.name.localeCompare(b.name, 'ko'));
    return Response.json({ day, checkedAt: new Date().toISOString(), arrivals }, { headers });
  } catch {
    return error('출석 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
  }
}
