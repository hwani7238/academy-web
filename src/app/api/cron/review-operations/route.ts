import {cron,failure} from '@/lib/operations/auth';
import {runIntegrityReview} from '@/lib/operations/integrity-review-service';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){try{cron(request);const result=await runIntegrityReview('scheduled-review',{scheduled:true});return Response.json({ok:true,checked:result.checked},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
