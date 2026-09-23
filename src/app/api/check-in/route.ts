import { enrollmentState } from '@/lib/operations/lifecycle';
import { database, sameOrigin, device, failure } from '@/lib/operations/auth';
import { pair, checkIn } from '@/lib/operations/service';
import { after } from 'next/server';
import { processNotices } from '@/lib/operations/notices';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request); const input = await request.json();
    if (input.action === 'pair') {
      const token = await pair(input.code);
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': `whee_device=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7776000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` } });
    }
    const actor = await device(request);
    if (input.action === 'status') return Response.json({ ok: true });
    if (typeof input.digits !== 'string' || !/^[0-9]{4}$/.test(input.digits)) throw new Error('뒷번호 네 자리를 입력해주세요.');
    if (input.action === 'lookup') {
      const matches = await database().collection('opsAccounts').where('checkinSuffixes', 'array-contains', input.digits).get();
      const available = await Promise.all(matches.docs.filter(d=>d.data().active).map(async d=>{const owner=(await database().doc(`students/${d.data().sourceStudentId || d.id}`).get()).data();return owner && enrollmentState(owner.lifecycle) === 'active' ? {id:d.id,name:d.data().name} : null;}));
      return Response.json({ matches: available.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.action === 'checkIn') {
      const result = await checkIn(input.studentId, input.digits, `device:${actor}`);
      after(async () => { try { await processNotices(); } catch { console.error('Notification worker failed; pending records retained.'); } });
      return Response.json(result);
    }
    throw new Error('지원하지 않는 작업입니다.');
  } catch (error) { return failure(error); }
}
