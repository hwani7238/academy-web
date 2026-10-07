import {database,manager,failure,HttpError} from '@/lib/operations/auth';
import {paymentMonthBounds,monthlyPayments} from '@/lib/operations/payment-month';
import {seoulDay,type Payment} from '@/lib/operations/model';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 try{
  await manager(request);
  const month=new URL(request.url).searchParams.get('month')||seoulDay().slice(0,7);
  let bounds:ReturnType<typeof paymentMonthBounds>;
  try{bounds=paymentMonthBounds(month);}catch{throw new HttpError(400,'조회 월을 확인해주세요.');}
  const collection=database().collection('opsPayments');
  // Explicit payment dates include backdated receipts; legacy receipts use KST recording dates.
  // Each query ranges over one indexed field and has no recent-record limit.
  const [dated,recorded]=await Promise.all([
   collection.where('paymentDate','>=',bounds.start).where('paymentDate','<',bounds.end).get(),
   collection.where('at','>=',bounds.atStart).where('at','<',bounds.atEnd).get()
  ]);
  const payments=new Map<string,Payment>();
  for(const doc of dated.docs)payments.set(doc.id,{...doc.data(),id:doc.id} as Payment);
  for(const doc of recorded.docs)if(!doc.data().paymentDate)payments.set(doc.id,{...doc.data(),id:doc.id} as Payment);
  return Response.json({month,payments:monthlyPayments([...payments.values()],month).rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
