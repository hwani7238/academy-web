import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { canViewPianoAttendance, koreaDay } from '@/lib/teacher-attendance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const preferredRegion = 'icn1';
const headers = { 'Cache-Control': 'private, no-store, no-transform', Vary: 'Authorization' };

export async function GET(request: Request) {
  if (!adminAuth || !adminDb) return Response.json({error:'서버 연결 설정을 확인해주세요.'},{status:503,headers});
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({error:'로그인이 필요합니다.'},{status:401,headers});
  let uid: string, expires: number;
  try { const decoded = await adminAuth.verifyIdToken(token,true); uid = decoded.uid; expires = decoded.exp * 1000; }
  catch { return Response.json({error:'다시 로그인해주세요.'},{status:401,headers}); }
  const db = adminDb, profile = db.doc(`users/${uid}`);
  try {
    if (!canViewPianoAttendance((await profile.get()).data())) return Response.json({error:'승인된 피아노 강사와 관리자만 사용할 수 있습니다.'},{status:403,headers});
  } catch { return Response.json({error:'연결을 확인해주세요.'},{status:503,headers}); }
  const day = koreaDay(), encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const subscriptions: Array<() => void> = [];
      const timers: { heartbeat?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout> } = {};
      const close = () => {
        if (closed) return; closed = true;
        clearInterval(timers.heartbeat); clearTimeout(timers.timeout);
        request.signal.removeEventListener('abort',close);
        subscriptions.splice(0).forEach(stop=>stop());
        try { controller.close(); } catch { /* The consumer may already have cancelled. */ }
      };
      cleanup = close;
      const send = (type: string) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify({type,day})}\n\n`)); };
      const subscribe = (stop: () => void) => { if (closed) stop(); else subscriptions.push(stop); };
      if (request.signal.aborted) { close(); return; }
      request.signal.addEventListener('abort',close,{once:true});
      // Renew the transport before the hosting limit, token expiry or Seoul midnight.
      // This is not an attendance polling timer. Firestore pushes actual writes.
      const midnight = Date.parse(`${day}T00:00:00+09:00`) + 86400000;
      timers.timeout = setTimeout(close,Math.max(1,Math.min(240000,expires-Date.now(),midnight-Date.now())));
      timers.heartbeat = setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(': keepalive\n\n'));},20000);
      try {
        subscribe(profile.onSnapshot(doc=>{
          if (!canViewPianoAttendance(doc.data())) { send('denied'); close(); }
        },()=>{send('retry');close();}));
        if (closed) return;
        // The raw records stay on the server. Teachers receive only an invalidation
        // signal; the existing API still authorizes and filters every data response.
        subscribe(db.collection('opsAttendance').where('day','==',day).onSnapshot(()=>send('changed'),()=>{send('retry');close();}));
      } catch { send('retry'); close(); }
    },
    cancel() { cleanup(); },
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'}});
}
