import { manager, failure } from '@/lib/operations/auth';
import { courseLedgerReports } from '@/lib/operations/course-ledger-service';
import {ledgerMigrationReports} from '@/lib/operations/ledger-migration-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 try {await manager(request);const params=new URL(request.url).searchParams;const rows=params.get('migration')==='1'?await ledgerMigrationReports():await courseLedgerReports(params.get('evidence')==='1');return Response.json({rows:params.get('studentId')?rows.filter(r=>r.studentId===params.get('studentId')):rows},{headers:{'Cache-Control':'no-store'}});} catch(e){return failure(e);}
}
