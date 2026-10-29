import { database } from './auth';
import { createHash } from 'node:crypto';
import { seoulDay } from './model';
import { attendanceTemplate } from './attendance-template';
// Attendance is a real-time notice, not a historical campaign. Never drain old
// attendance into parents' phones after credentials/template settings change.
const MAX_ATTENDANCE_AGE_MS = 10 * 60 * 1000;
export function noticeConfigured() {
  return Boolean(process.env.NHN_APP_KEY && process.env.NHN_SECRET_KEY && process.env.NHN_SENDER_KEY && process.env.NHN_ATTENDANCE_TEMPLATE
    && (process.env.NHN_ATTENDANCE_TEMPLATE !== 'ATTENDANCE_LOG_V1' || process.env.NHN_ATTENDANCE_CONTACT?.trim()));
}
function attendanceParameters(parameters: Record<string, string>, template: string) {
  if (!['ATTENDANCE_LOG_V1', 'ATTENDANCE_LOG_V2'].includes(template)) return parameters;
  // Match the academy's existing approved template exactly (Korean variables).
  return {
    '학원명': '위뮤직아카데미',
    '학생명': parameters.student_name,
    '출석시간': parameters.attendance_time,
    ...(template === 'ATTENDANCE_LOG_V1' ? { '연락처': process.env.NHN_ATTENDANCE_CONTACT!.trim() } : {}),
  };
}
export async function processNotices(noticeId?: string) {
  const db = database();
  // A new arrival must not wait behind unrelated or blocked historical notices.
  const pending = noticeId
    ? { docs: [await db.doc(`opsNotices/${noticeId}`).get()] }
    : await db.collection('opsNotices').where('status', '==', 'queued').limit(5).get();
  let submitted = 0;
  for (const item of pending.docs) {
    const queued = item.data();
    const template = queued?.kind === 'attendance' && queued.status === 'queued'
      ? await attendanceTemplate() : process.env.NHN_ATTENDANCE_TEMPLATE;
    const notice = await db.runTransaction(async tx => {
      const fresh = (await tx.get(item.ref)).data();
      if (!fresh || fresh.status !== 'queued') return null;
      let reason = '';
      if (fresh.kind === 'billing') {
        const invoice = (await tx.get(db.doc(`opsInvoices/${item.id.replace(/^billing_/, '')}`))).data();
        if (!invoice || invoice.status !== 'open') { tx.update(item.ref, { status: 'cancelled' }); return null; }
        if (invoice.needsReview) { tx.update(item.ref, { status: 'review', error: '횟수 수정 후 청구 확인이 필요합니다.' }); return null; }
        // Never substitute NHN for the contracted payment provider.
        tx.update(item.ref, { status: 'blocked', error: '결제선생 API 계약·테스트 연결 대기 중입니다. 실제 청구서는 발송되지 않았습니다.' });
        return null;
      }
      if (fresh.kind !== 'attendance' || !item.id.startsWith('attendance_')) {
        tx.update(item.ref, { status: 'cancelled', error: '지원하지 않는 알림입니다.' }); return null;
      }
      const attendance = (await tx.get(db.doc(`opsAttendance/${item.id.slice('attendance_'.length)}`))).data();
      if (!attendance || attendance.notificationSuppressed || attendance.studentId !== fresh.studentId || attendance.source !== 'kiosk' || !['present', 'makeup'].includes(attendance.status)) {
        tx.update(item.ref, { status: 'cancelled', error: '출석 기기에서 완료된 유효한 출석이 아닙니다.' }); return null;
      }
      const age = Date.now() - Date.parse(fresh.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > MAX_ATTENDANCE_AGE_MS || attendance.day !== seoulDay()) {
        tx.update(item.ref, { status: 'expired', error: '출석 후 10분이 지나 지난 출석 알림은 발송하지 않았습니다.' }); return null;
      }
      // Resolve pending notices against the current contact, preserving already sent history.
      const account = (await tx.get(db.doc(`opsAccounts/${fresh.studentId}`))).data();
      const phone = String(account?.phone || '').replace(/\D/g, '');
      if (!/^0\d{8,10}$/.test(phone)) reason = '알림 받을 보호자 전화번호를 확인해주세요.';
      if (!process.env.NHN_APP_KEY || !process.env.NHN_SECRET_KEY || !process.env.NHN_SENDER_KEY || !template) reason = '알림톡 발신 및 템플릿 설정이 필요합니다.';
      if (template === 'ATTENDANCE_LOG_V1' && !process.env.NHN_ATTENDANCE_CONTACT?.trim()) reason = '출석 알림에 표시할 학원 문의처 설정이 필요합니다.';
      if (reason) { tx.update(item.ref, { status: 'blocked', error: reason }); return null; }
      tx.update(item.ref, { status: 'processing', phone, startedAt: new Date().toISOString(), error: '' });
      return { phone, parameters: attendanceParameters(fresh.parameters as Record<string, string>, template!), template };
    });
    if (!notice) continue;
    // Never blindly retry an uncertain external send. A crash after submission
    // leaves 'processing' for reconciliation, not automatic re-submission.
    try {
      const response = await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${process.env.NHN_APP_KEY}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-Secret-Key': process.env.NHN_SECRET_KEY!, 'X-NC-API-IDEMPOTENCY-KEY': createHash('sha256').update(item.id).digest('hex') },
        body: JSON.stringify({ senderKey: process.env.NHN_SENDER_KEY, templateCode: notice.template, recipientList: [{ recipientNo: notice.phone, templateParameter: notice.parameters, resendParameter: { isResend: false } }] }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.json();
      const recipient = body.message?.sendResults?.[0];
      if (response.ok && body.header?.isSuccessful === true && recipient?.resultCode === 0 && typeof body.message?.requestId === 'string' && body.message.requestId && Number.isInteger(recipient.recipientSeq)) {
        await item.ref.update({ status: 'submitted', templateCode: notice.template, requestId: body.message.requestId, recipientSeq: recipient.recipientSeq, submittedAt: new Date().toISOString() }); submitted++;
      } else {
        const rejected = body.header?.isSuccessful === false || (typeof recipient?.resultCode === 'number' && recipient.resultCode !== 0);
        await item.ref.update({ status: response.status >= 500 || !rejected ? 'unknown' : 'failed', error: 'NHN 처리 결과를 확인해주세요.', resultCode: String(recipient?.resultCode ?? body.header?.resultCode ?? response.status) });
      }
    } catch {
      await item.ref.update({ status: 'unknown', error: '발송 결과가 불명확합니다. NHN 발송 내역을 확인해주세요.' });
    }
  }
  return { examined: pending.docs.length, submitted };
}
