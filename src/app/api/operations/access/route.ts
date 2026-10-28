import { manager, failure } from '@/lib/operations/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { await manager(request); return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { const response = failure(error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
}
