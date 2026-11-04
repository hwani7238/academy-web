import { manager, failure } from '@/lib/operations/auth';
import { courseLedgerReports } from '@/lib/operations/course-ledger-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 try {await manager(request);return Response.json({rows:await courseLedgerReports()},{headers:{'Cache-Control':'no-store'}});} catch(e){return failure(e);}
}
