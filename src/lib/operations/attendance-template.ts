const CHAT_TEMPLATE = 'ATTENDANCE_LOG_V2';
const CHAT_URL = 'https://pf.kakao.com/_xgfByn/chat';
const CONTENT = '[#{학원명}] 출석 알림\n\n#{학생명} 학생이 #{출석시간}에 출석했습니다.';
let cached: { key: string; expires: number; ready: Promise<boolean> } | undefined;

// Check the exact approved content and destination before switching a live
// attendance stream. Review delays and lookup failures keep the current template.
export async function attendanceTemplate() {
  const fallback = process.env.NHN_ATTENDANCE_TEMPLATE;
  const candidate = process.env.NHN_ATTENDANCE_CHAT_TEMPLATE;
  const app = process.env.NHN_APP_KEY, secret = process.env.NHN_SECRET_KEY, sender = process.env.NHN_SENDER_KEY;
  if (candidate !== CHAT_TEMPLATE || !app || !secret || !sender) return fallback;
  const key = JSON.stringify([app, secret, sender, candidate]);
  if (!cached || cached.key !== key || cached.expires <= Date.now()) {
    cached = { key, expires: Date.now() + 60_000, ready: (async () => {
      try {
        const response = await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${app}/senders/${sender}/templates/${candidate}`, {
          headers: { 'X-Secret-Key': secret }, signal: AbortSignal.timeout(3000), cache: 'no-store',
        });
        const body = await response.json();
        const template = body.template;
        const button = template?.buttons?.[0];
        return Boolean(response.ok && body.header?.isSuccessful === true
          && template?.templateCode === CHAT_TEMPLATE && template.status === 'TSC03'
          && template.block === false && template.dormant === false
          && template.templateContent === CONTENT && template.templateMessageType === 'BA' && template.templateEmphasizeType === 'NONE'
          && !template.templateExtra && !template.templateAd && !template.templateTitle && !template.templateHeader && !template.templateImageUrl
          && !template.quickReplies?.length && template.buttons?.length === 1
          && button.ordering === 1 && button.type === 'WL' && button.name === '문의하기'
          && button.linkMo === CHAT_URL && button.linkPc === CHAT_URL);
      } catch { return false; }
    })() };
  }
  return await cached.ready ? candidate : fallback;
}
