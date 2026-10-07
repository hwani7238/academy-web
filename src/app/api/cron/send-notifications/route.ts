import { cron, failure } from '@/lib/operations/auth';
import { processNotices } from '@/lib/operations/notices';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  try { cron(request); return Response.json(await processNotices()); }
  catch (error) { return failure(error); }
}
