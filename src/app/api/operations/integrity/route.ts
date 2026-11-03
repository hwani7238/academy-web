import {manager,sameOrigin,failure} from '@/lib/operations/auth';
import {scanBillingIntegrity} from '@/lib/operations/integrity-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){try{sameOrigin(request);const actor=await manager(request);return Response.json(await scanBillingIntegrity(actor),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
