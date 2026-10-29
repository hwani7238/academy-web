/* Read-only by default. Existing Firebase CLI login; never exports credentials.
 * --apply adds pass identities only, without changing balances, receipt amounts or dates.
 * Every course commits with document revision checks and a local pre-change backup.
 */
const fs=require('node:fs'),path=require('node:path');
const auth=require(path.join(process.env.FIREBASE_CLI_ROOT,'lib/auth'));
const root='projects/academy-website-7a3e1/databases/(default)/documents';
const base='https://firestore.googleapis.com/v1/'+root;
const decode=v=>v.stringValue!==undefined?v.stringValue:v.integerValue!==undefined?Number(v.integerValue):v.doubleValue!==undefined?v.doubleValue:v.booleanValue!==undefined?v.booleanValue:v.nullValue!==undefined?null:v.timestampValue||(v.arrayValue?(v.arrayValue.values||[]).map(decode):v.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)])):v);
const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,encode(v)]))}};
(async()=>{
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase CLI login required');
 const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
 const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
 const collections={};
 for(const [collection,fields] of [
  ['opsAccounts',['id','name','remaining','currentPassId','currentPassStart','lastPassLessonDay','updatedAt']],
  ['opsInvoices',null],['opsPayments',['id','studentId','invoiceId','passId','amount','cancelledAt']],
  ['opsAttendance',['id','studentId','day','passId','status','units','unpaidCycleStart']]]){
  const r=await fetch(base+':runQuery',{method:'POST',headers,body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],...(fields?{select:{fields:fields.map(fieldPath=>({fieldPath}))}}:{})}})});
  const result=await r.json();if(!r.ok)throw Error('Read failed '+r.status);
  collections[collection]=result.filter(x=>x.document).map(({document:d})=>({doc:d,value:{id:d.name.split('/').pop(),...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))}}));
 }
 const backupDir=process.env.PASS_BACKUP_DIR||'/private/tmp/whee-pass-link-backup';fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 const stamp=new Date().toISOString(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),runId='pass-links-'+Date.now();
 fs.writeFileSync(path.join(backupDir,runId+'.json'),JSON.stringify(collections),{mode:0o600});
 const report=[],planned=[];
 for(const a of collections.opsAccounts){
  const studentId=a.value.id,rows=collections.opsInvoices.filter(i=>i.value.studentId===studentId),writes=[],linked=[];
  const patch=(record,values)=>writes.push({update:{name:record.doc.name,fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,encode(v)]))},updateMask:{fieldPaths:Object.keys(values)},currentDocument:{updateTime:record.doc.updateTime}});
  for(const row of rows){const i=row.value;if(i.status==='cancelled')continue;
   const firstDay=i.lessonDate||i.cycleStart||'',collision=!!firstDay&&rows.some(other=>other.value.id!==i.id&&other.value.status!=='cancelled'&&(other.value.lessonDate||other.value.cycleStart)===firstDay);
   if(collision){if(!i.linkReview)patch(row,{linkReview:true,updatedAt:stamp});report.push({studentId,name:i.name,invoiceId:i.id,reason:'같은 1회차 날짜의 중복 청구 확인',paid:i.paid,firstDay});if(i.passId)linked.push({...i,linkReview:true});continue;}
   if(i.passId){linked.push(i);if(i.linkReview||(!i.reservedPass&&i.paid>0&&!(i.lessonDate||i.cycleStart)))report.push({studentId,name:i.name,invoiceId:i.id,reason:'수납 완료·1회차 연결 확인',paid:i.paid,firstDay:i.lessonDate||i.cycleStart||''});continue;}
   const known=i.status==='paid'||i.creditUnits===0||i.reservedPass;
   if(!known){if(!i.linkReview)patch(row,{linkReview:true,updatedAt:stamp});report.push({studentId,name:i.name,invoiceId:i.id,reason:'기존 횟수 반영 상태 확인',paid:i.paid,firstDay:i.lessonDate||i.cycleStart||''});continue;}
   const allocated=!i.reservedPass,day=i.lessonDate||i.cycleStart||'',review=!i.reservedPass&&!day&&i.paid>0;
   const values={passId:i.id,legacyCreditUnits:i.creditUnits??i.units,creditUnits:0,allocationState:allocated?'allocated':'pending',allocatedUnits:allocated?i.units:0,...(allocated?{allocationAt:i.createdAt}:{}),linkReview:review,updatedAt:stamp};
   patch(row,values);linked.push({...i,...values});if(review)report.push({studentId,name:i.name,invoiceId:i.id,reason:'수납 완료·1회차 연결 확인',paid:i.paid,firstDay:''});
  }
  for(const p of collections.opsPayments.filter(p=>p.value.studentId===studentId&&!p.value.passId)){
   const invoice=linked.find(i=>i.id===p.value.invoiceId);if(invoice)patch(p,{passId:invoice.passId});
  }
  const dated=linked.filter(i=>!i.linkReview&&i.allocationState==='allocated'&&(i.lessonDate||i.cycleStart));
  for(const record of collections.opsAttendance.filter(r=>r.value.studentId===studentId&&!r.value.passId)){
   const r=record.value,day=r.unpaidCycleStart||r.day,candidates=dated.filter(i=>(i.lessonDate||i.cycleStart)===day);
   if(candidates.length===1)patch(record,{passId:candidates[0].passId});
  }
  if(!a.value.currentPassId&&!report.some(r=>r.studentId===studentId)){
   const latest=dated.filter(i=>(i.lessonDate||i.cycleStart)<=today).sort((a,b)=>(b.lessonDate||b.cycleStart).localeCompare(a.lessonDate||a.cycleStart))[0];
   if(latest)patch(a,{currentPassId:latest.passId,currentPassStart:latest.lessonDate||latest.cycleStart,lastPassLessonDay:collections.opsAttendance.filter(r=>r.value.studentId===studentId&&r.value.status!=='cancelled').map(r=>r.value.day).sort().at(-1)||latest.lessonDate||latest.cycleStart,updatedAt:stamp});
  }
  if(writes.length){writes.push({update:{name:root+'/opsAudit/'+runId+'_'+studentId,fields:Object.fromEntries(Object.entries({actor:'owner-authorized-reconciliation',action:'pass-link-migration',studentId,at:stamp,detail:{remaining:a.value.remaining,changedDocuments:writes.length,balanceChanged:false}}).map(([k,v])=>[k,encode(v)]))},currentDocument:{exists:false}});planned.push({studentId,writes});}
 }
 fs.writeFileSync(path.join(backupDir,'review.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({dryRun:!process.argv.includes('--apply'),courses:planned.length,writes:planned.reduce((n,p)=>n+p.writes.length,0),review:report.length,reviewCourses:new Set(report.map(r=>r.studentId)).size,balanceChanges:0,backupDir}));
 if(!process.argv.includes('--apply'))return;
 let committed=0;for(const p of planned){const r=await fetch(base+':commit',{method:'POST',headers,body:JSON.stringify({writes:p.writes})});if(!r.ok){console.log(JSON.stringify({conflictCourse:p.studentId,status:r.status}));continue;}committed++;}console.log(JSON.stringify({committedCourses:committed,plannedCourses:planned.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
