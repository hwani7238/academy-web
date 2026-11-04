import {manager,sameOrigin,failure} from '@/lib/operations/auth';
import {getIntegrityStatus,runIntegrityReview} from '@/lib/operations/integrity-review-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{sameOrigin(request);const actor=await manager(request);return Response.json(await runIntegrityReview(actor),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}

export async function GET(request:Request){try{await manager(request);return Response.json(await getIntegrityStatus(),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
