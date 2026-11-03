import {database} from './auth';
import {inspectBilling,type IntegrityIssue} from './billing-integrity';
import {seoulDay,type Account,type Attendance,type Invoice,type LegacyAttendance} from './model';
import type {LessonReference} from './lesson-reference';
import {correctedLegacy,type LegacyCorrection} from './legacy-correction';
import {courseLifecycle,enrollmentState} from './lifecycle';
export type IntegritySource={id:string;asOf?:string;attendanceCutoffs?:Record<string,string>;history?:{cells?:{day:string;value:string;color:string}[]}[]};
export function integrityLegacy(account:Account,sources:IntegritySource[],corrections:LegacyCorrection[]){
 const source=sources.find(s=>s.id===account.importId),out:LegacyAttendance[]=[];
 for(const h of source?.history||[])for(const cell of h.cells||[])if(cell.day<=(source?.attendanceCutoffs?.[cell.day.slice(0,7)]||source?.asOf||''))out.push(correctedLegacy({studentId:account.id,...cell,value:String(cell.value),color:cell.color||''},corrections.find(c=>c.studentId===account.id&&c.day===cell.day)));
 return out;
}
export async function scanBillingIntegrity(actor:string,onlyStudent?:string){
 const db=database(),today=seoulDay(),stamp=new Date().toISOString();
 const scoped=(c:string)=>onlyStudent?db.collection(c).where('studentId','==',onlyStudent):db.collection(c);
 const [accounts,invoices,attendance,refs,sources,corrections,students]=await Promise.all([
  onlyStudent?db.doc(`opsAccounts/${onlyStudent}`).get().then(d=>({docs:d.exists?[d]:[]})):db.collection('opsAccounts').get(),scoped('opsInvoices').get(),scoped('opsAttendance').get(),db.collection('opsLessonReferences').get(),db.collection('opsImports').get(),db.collection('opsLegacyCorrections').get(),db.collection('students').get()]);
 const rr=attendance.docs.map(d=>({...d.data(),id:d.id}) as Attendance),ii=invoices.docs.map(d=>({...d.data(),id:d.id}) as Invoice),references=refs.docs.flatMap(d=>d.data().references||[]) as LessonReference[],imports=sources.docs.map(d=>({...d.data(),id:d.id}) as IntegritySource),cc=corrections.docs.map(d=>d.data() as LegacyCorrection);
 const issues:IntegrityIssue[]=[],repaired:{studentId:string;name:string;day:string}[]=[],failed:string[]=[];let checked=0;
 for(const doc of accounts.docs){
  const a={...doc.data(),id:doc.id} as Account,owner=students.docs.find(d=>d.id===(a.sourceStudentId||a.id));
  if(!a.active)continue;
  checked++;
  const eligible=!!owner&&enrollmentState(courseLifecycle(owner.data(),a.id),today)==='active';
  const legacy=integrityLegacy(a,imports,cc),check=inspectBilling(a,ii,rr,references,legacy,today,stamp);
  if(!eligible){
   issues.push(...check.issues.map(i=>({...i,automatic:false,reason:i.reason+' (등록 상태 확인 후 처리)'})));
   if(!owner)issues.push({studentId:a.id,name:a.name,day:'',kind:'missing-student',automatic:false,reason:'이 수강 설정에 연결된 학생 등록 정보가 없습니다. 과거 또는 중복 수강 설정인지 확인해주세요.'});
   continue;
  }
  if(!check.plans.length){issues.push(...check.issues);continue;}
  try{
   const result=await db.runTransaction(async tx=>{
    const [as,ins,ats,rs,cs,source,ownerNow]=await Promise.all([tx.get(db.doc(`opsAccounts/${a.id}`)),tx.get(db.collection('opsInvoices').where('studentId','==',a.id)),tx.get(db.collection('opsAttendance').where('studentId','==',a.id)),tx.get(db.collection('opsLessonReferences')),tx.get(db.collection('opsLegacyCorrections').where('studentId','==',a.id)),a.importId?tx.get(db.doc(`opsImports/${a.importId}`)):Promise.resolve(null),tx.get(db.doc(`students/${a.sourceStudentId||a.id}`))]);
    const current={...as.data(),id:a.id} as Account,now=new Date().toISOString(),bills=ins.docs.map(d=>({...d.data(),id:d.id}) as Invoice),records=ats.docs.map(d=>({...d.data(),id:d.id}) as Attendance);
    if(!current.active||!ownerNow.exists||enrollmentState(courseLifecycle(ownerNow.data()!,a.id),today)!=='active'||current.updatedAt!==a.updatedAt)throw Error('점검 중 수강 정보가 변경됐습니다. 다음 점검에서 다시 확인합니다.');
    const verified=inspectBilling(current,bills,records,rs.docs.flatMap(d=>d.data().references||[]),integrityLegacy(current,source?.exists?[{...source.data(),id:source.id} as IntegritySource]:[],cs.docs.map(d=>d.data() as LegacyCorrection)),today,now);
    if(verified.plans.length!==1)return {issues:verified.issues,repaired:null};
    const p=verified.plans[0];
    if(bills.some(i=>i.id===p.invoice.id))tx.update(db.doc(`opsInvoices/${p.invoice.id}`),{...p.invoice});else tx.create(db.doc(`opsInvoices/${p.invoice.id}`),p.invoice);
    tx.update(as.ref,{...p.account});for(const r of p.attendance)tx.update(db.doc(`opsAttendance/${r.id}`),{passId:r.passId,updatedAt:now});
    tx.create(db.collection('opsAudit').doc(),{studentId:a.id,actor,action:'correct-remaining',at:now,detail:{reason:'automatic-billing-integrity',before:current.remaining,after:p.account.remaining,accountBefore:current,invoiceBefore:bills.find(i=>i.id===p.invoice.id)||null,invoiceAfter:p.invoice,attendanceBefore:records.filter(r=>p.attendance.some(x=>x.id===r.id)),paymentUnchanged:true}});
    const nextBills=[...bills.filter(i=>i.id!==p.invoice.id),p.invoice],nextRecords=records.map(r=>p.attendance.find(n=>n.id===r.id)||r);
    return {issues:inspectBilling(p.account,nextBills,nextRecords,references,legacy,today,now).issues,repaired:{studentId:a.id,name:a.name,day:p.invoice.lessonDate!}};
   });issues.push(...result.issues);if(result.repaired)repaired.push(result.repaired);
  }catch(e){failed.push(a.id);issues.push({studentId:a.id,name:a.name,day:'',kind:'scan-failed',automatic:false,reason:e instanceof Error?e.message:'자동 점검에 실패했습니다. 다시 점검해주세요.'});}
 }
 return {checked,total:accounts.docs.length,skipped:accounts.docs.length-checked,checkedAt:new Date().toISOString(),issues,repaired,failed};
}
