import { database, manager, failure, hash } from '@/lib/operations/auth';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await manager(request);
    const latest = await database().collection('opsAttendance').orderBy('updatedAt', 'desc').limit(1).select('updatedAt').get();
    const revision = hash(JSON.stringify(latest.docs.map(d => [d.id, d.data().updatedAt, d.updateTime])));
    return Response.json({ revision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
