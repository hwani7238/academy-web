import { createHash, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() { if (!adminDb) throw new HttpError(503, '서버 연결 설정이 필요합니다.'); return adminDb; }
export async function manager(request: Request) {
  if (!adminAuth) throw new HttpError(503, '서버 연결 설정이 필요합니다.');
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(token, true)).uid; } catch { throw new HttpError(401, '다시 로그인해주세요.'); }
  const profile = (await database().doc(`users/${uid}`).get()).data();
  // Financial access is intentionally narrower than the existing staff permission.
  if (!profile || !['admin', 'wonjang'].includes(profile.role)) throw new HttpError(403, '원장 계정만 사용할 수 있습니다.');
  return uid;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function device(request: Request) {
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('whee_device='))?.slice(12);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, '출석 기기 등록이 필요합니다.');
  const id = hash(token);
  const db = database();
  const ref = db.doc(`opsDevices/${id}`);
  await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data?.active || data.expiresAt < Date.now()) throw new HttpError(401, '출석 기기를 다시 등록해주세요.');
    const now = Date.now();
    const fresh = now - (data.windowStart || 0) >= 60000;
    const count = fresh ? 1 : (data.requests || 0) + 1;
    if (count > 60) throw new HttpError(429, '잠시 후 다시 입력해주세요.');
    tx.update(ref, { requests: count, windowStart: fresh ? now : data.windowStart });
  });
  return id;
}
export function cron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new HttpError(401, 'Unauthorized');
}
export function failure(error: unknown) {
  return Response.json({ error: error instanceof HttpError ? error.message : error instanceof Error ? error.message : '처리하지 못했습니다.' }, { status: error instanceof HttpError ? error.status : 400 });
}
