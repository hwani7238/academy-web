import { database, manager, failure } from '@/lib/operations/auth';

import { operationsRevision } from '@/lib/operations/revision';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await manager(request);
    const revision = await operationsRevision(database());
    return Response.json({ revision }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
