import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { ADMIN_ROLES } from '@/lib/constants';

export async function POST(request: Request) {
    if (!adminAuth || !adminDb) return NextResponse.json({ success: false, error: 'Server Configuration Error' }, { status: 503 });
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    let uid: string;
    try { uid = (await adminAuth.verifyIdToken(token, true)).uid; }
    catch { return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }); }
    const profile = (await adminDb.doc(`users/${uid}`).get()).data();
    const isAdmin = profile && ADMIN_ROLES.includes(profile.role);
    const isTeacher = profile?.role === 'teacher' && (profile.status ?? 'approved') === 'approved';
    if (!isAdmin && !isTeacher) return NextResponse.json({ success: false, error: '승인된 강사 또는 관리자만 발송할 수 있습니다.' }, { status: 403 });
    let input;
    try { input = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }
    if (![input.studentId, input.logId].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v))) return NextResponse.json({ success: false, error: '학생과 피드백 정보를 확인해주세요. 화면을 새로고침해주세요.' }, { status: 400 });
    const [studentSnap, logSnap] = await Promise.all([adminDb.doc(`students/${input.studentId}`).get(), adminDb.doc(`students/${input.studentId}/logs/${input.logId}`).get()]);
    const student = studentSnap.data(); const log = logSnap.data();
    if (!student || !log?.reportToken) return NextResponse.json({ success: false, error: '피드백을 찾을 수 없습니다.' }, { status: 404 });
    const assigned = student.teachers?.[log.instrument];
    const subjects = profile?.subjects || (profile?.subject ? [profile.subject] : []);
    if (!isAdmin && (log.authorId !== uid || (assigned ? assigned !== uid : !subjects.includes(log.instrument)))) return NextResponse.json({ success: false, error: '담당 학생의 피드백만 발송할 수 있습니다.' }, { status: 403 });
    const appKey = process.env.NHN_APP_KEY; const secretKey = process.env.NHN_SECRET_KEY; const senderKey = process.env.NHN_SENDER_KEY;
    if (!appKey || !secretKey || !senderKey) return NextResponse.json({ success: false, error: '알림톡 연결 설정이 필요합니다.' }, { status: 503 });
    // The receiver, template, and report URL are derived on the server.
    const origin = process.env.APP_ORIGIN || 'https://wheemusic.com';
    const link = `${origin}/report/${input.studentId}/${input.logId}?t=${encodeURIComponent(log.reportToken)}`.replace(/^https?:\/\//, '');
    try {
        const response = await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${appKey}/messages`, {
            method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-Secret-Key': secretKey },
            body: JSON.stringify({ senderKey, templateCode: 'FEEDBACK_LOG_V2', recipientList: [{ recipientNo: String(student.phone || '').replace(/[^0-9]/g, ''), templateParameter: { student_name: student.name, link } }] }), signal: AbortSignal.timeout(8000),
        });
        const data = await response.json();
        if (!response.ok || data.header?.isSuccessful !== true || (data.recipientList?.[0] && data.recipientList[0].resultCode !== 0)) return NextResponse.json({ success: false, error: 'NHN 발송 내역을 확인해주세요.' }, { status: 502 });
        return NextResponse.json({ success: true, requestId: data.requestId || '' });
    } catch { return NextResponse.json({ success: false, error: '발송 결과를 확인하지 못했습니다. NHN 내역 확인 후 처리해주세요.' }, { status: 502 }); }
}
