import { database } from './auth';
export function noticeConfigured() { return Boolean(process.env.NHN_APP_KEY && process.env.NHN_SECRET_KEY && process.env.NHN_SENDER_KEY && process.env.NHN_ATTENDANCE_TEMPLATE && process.env.NHN_BILLING_TEMPLATE); }
export async function processNotices() {
  const db = database();
  const pending = await db.collection('opsNotices').where('status', '==', 'queued').limit(5).get();
  let submitted = 0;
  for (const item of pending.docs) {
    const notice = await db.runTransaction(async tx => {
      const fresh = (await tx.get(item.ref)).data();
      if (!fresh || fresh.status !== 'queued') return null;
      let reason = '';
      if (fresh.kind === 'billing') {
        const invoice = (await tx.get(db.doc(`opsInvoices/${item.id.replace(/^billing_/, '')}`))).data();
        if (!invoice || invoice.status !== 'open') { tx.update(item.ref, { status: 'cancelled' }); return null; }
        if (invoice.needsReview) { tx.update(item.ref, { status: 'review', error: '횟수 수정 후 청구 확인이 필요합니다.' }); return null; }
        fresh.parameters = { ...fresh.parameters, amount: String(invoice.amount - invoice.paid) };
      }
      const template = fresh.kind === 'attendance' ? process.env.NHN_ATTENDANCE_TEMPLATE : process.env.NHN_BILLING_TEMPLATE;
      if (!process.env.NHN_APP_KEY || !process.env.NHN_SECRET_KEY || !process.env.NHN_SENDER_KEY || !template) reason = '알림톡 발신 및 템플릿 설정이 필요합니다.';
      if (reason) { tx.update(item.ref, { status: 'blocked', error: reason }); return null; }
      tx.update(item.ref, { status: 'processing', startedAt: new Date().toISOString(), error: '' });
      return { phone: fresh.phone as string, parameters: fresh.parameters as Record<string, string>, template };
    });
    if (!notice) continue;
    // Never blindly retry an uncertain external send. A crash after submission
    // leaves 'processing' for reconciliation, not automatic re-submission.
    try {
      const response = await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${process.env.NHN_APP_KEY}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-Secret-Key': process.env.NHN_SECRET_KEY! },
        body: JSON.stringify({ senderKey: process.env.NHN_SENDER_KEY, templateCode: notice.template, recipientList: [{ recipientNo: notice.phone, templateParameter: notice.parameters }] }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.json();
      const recipient = body.recipientList?.[0];
      if (response.ok && body.header?.isSuccessful === true && (!recipient || recipient.resultCode === 0)) {
        await item.ref.update({ status: 'submitted', requestId: body.requestId || '', submittedAt: new Date().toISOString() }); submitted++;
      } else {
        await item.ref.update({ status: response.status >= 500 ? 'unknown' : 'failed', error: 'NHN 처리 결과를 확인해주세요.', resultCode: String(recipient?.resultCode ?? body.header?.resultCode ?? response.status) });
      }
    } catch {
      await item.ref.update({ status: 'unknown', error: '발송 결과가 불명확합니다. NHN 발송 내역을 확인해주세요.' });
    }
  }
  return { examined: pending.size, submitted };
}
