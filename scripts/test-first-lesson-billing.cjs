const fs=require('node:fs'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
function load(name,exports,deps={}){const code=stripTypeScriptTypes(fs.readFileSync('src/lib/operations/'+name+'.ts','utf8')).replace(/^import .*$/gm,'').replace(/export /g,'');return new Function(...Object.keys(deps),code+';return {'+exports.join(',')+'};')(...Object.values(deps));}
const model=load('model',['seoulDay','validDay']);
const history=load('pass-history',['passUnitsOn','passCycleStarts'],model);
const academy=load('academy-calendar',['academyClosed']);
const schedule=load('schedule',['plannedLesson'],{...academy,...model});
const display=load('billing-display',['invoiceCycleStart'],model);
const appearance=load('attendance-appearance',['isFirstLesson','legacyAttendanceAppearance'],{...model,...display});
const reference=load('lesson-reference',['referenceOrdinal'],model);
const sequence=load('attendance-sequence',['attendanceSequence'],{...history,...schedule,...appearance,...reference});
const forecast=load('attendance-forecast',['attendanceForecast'],{...sequence,...schedule});
const lifecycle=load('lifecycle',['enrollmentState'],model);
const billing=load('upcoming-billing',['billingProjection','finalLessonInvoices'],{...forecast,...sequence,...appearance,...display,...lifecycle,...model});
const today='2026-10-16';
const account=(id,remaining=4)=>({id,name:'Student '+id,active:true,planUnits:8,planAmount:160000,remaining,schedule:{rules:[{start:'2026-10-01',weekdays:[1,5]}],moves:[]}});
const ref=(id,day,value='1',color='')=>({studentId:id,day,value,color,row:1});
const inv=(id,day,status='open',paid=0)=>({id:'invoice_'+id,studentId:id,name:'Student '+id,lessonDate:day,units:8,amount:160000,paid,status,needsReview:false,createdAt:'2026-10-10T00:00:00Z'});
function data(accounts,refs=[],extra={}){return {day:today,accounts,students:accounts.map(a=>({id:a.id,name:a.name})),attendance:[],legacyAttendance:[],invoices:[],settledInvoices:[],payments:[],notices:[],devices:[],sequenceContext:{positions:{},cycleStarts:[],references:refs},...extra};}
function result(d,date=today){const p=billing.billingProjection(d,date);return {projection:p.upcoming,visible:billing.finalLessonInvoices(d,[...d.invoices,...p.upcoming],date)};}
const original=data([account('a'),account('b')],[ref('a','2026-10-02','7'),ref('a','2026-10-12','8'),ref('a',today),ref('b','2026-10-02','7'),ref('b','2026-10-12','8'),ref('b',today)]);
const before=JSON.stringify(original);let r=result(original);
assert.deepEqual(r.visible.map(i=>[i.studentId,i.lessonDate]),[['a',today],['b',today]]);
assert.equal(JSON.stringify(original),before);
assert.equal(result(original,'2026-10-17').visible.length,2,'ledger-only first lessons remain visible after their day');
const settled={...original,settledInvoices:[inv('a',today,'paid',160000)]};
assert.deepEqual(result(settled).visible.map(i=>i.studentId),['b']);
const partial={...original,invoices:[inv('a',today,'open',50000)]};
r=result(partial);assert.equal(r.visible.filter(i=>i.studentId==='a').length,1);assert.equal(r.visible.find(i=>i.studentId==='a').paid,50000);
const future=data([account('later'),account('last',1)],[ref('later','2026-10-19'),ref('last','2026-10-19')]);
future.sequenceContext.positions={later:7,last:7};
assert.deepEqual(result(future).visible.map(i=>i.studentId),['last'],'future first lessons with more than one remaining stay hidden');
const actual=data([account('actual')],[],{attendance:[{studentId:'actual',day:'2026-10-15',status:'present',units:1}],sequenceContext:{positions:{actual:8},cycleStarts:[]}});
assert.equal(result(actual).visible[0].lessonDate,'2026-10-15');
const legacy=data([account('legacy')],[],{legacyAttendance:[{studentId:'legacy',day:'2026-10-15',value:'1',color:'#9900FF'}]});
assert.equal(result(legacy).visible[0].lessonDate,'2026-10-15');
for(const status of ['paused','cancelled','travel','makeup','makeup_reserved']){
 const protectedData=data([account(status)],[ref(status,today)],{attendance:[{studentId:status,day:today,status,units:0}]});
 assert.equal(result(protectedData).visible.length,0,status+' is not a new unpaid regular first lesson');
}
const off=data([{...account('off'),active:false}],[ref('off',today)]);assert.equal(result(off).visible.length,0);
const leave=data([account('leave')],[ref('leave',today)]);leave.students[0].lifecycle={status:'paused',until:'2026-10-31'};assert.equal(result(leave).visible.length,0);
const cancelled={...original,cancelledInvoiceKeys:['a_'+today,'b_'+today]};assert.equal(result(cancelled).visible.length,0,'cancelled bills are not recreated');
const refunded=data([{...account('refunded',8),schedule:{rules:[],moves:[]}}],[],{invoices:[{...inv('refunded','2026-11-01'),receiptCancelledAt:'2026-10-16T00:00:00Z'}]});assert.equal(result(refunded).visible.length,1,'receipt cancellation exception is preserved');
const existing=data([account('existing',5)],[],{invoices:[inv('existing',today)]});assert.equal(result(existing).visible.length,1,'explicitly dated open first lesson is collectible');
const paid=data([{...account('paid',0),schedule:{rules:[],moves:[]}}],[],{invoices:[inv('paid',today,'paid',160000)]});assert.equal(result(paid).visible.length,0);
console.log('PASS: two balance-4 ledger students visible on first day and next day; actual and legacy first lessons; paid/cancelled exclusion; partial-payment deduplication; future/high-balance exclusion; final-lesson and receipt-cancellation compatibility; travel/makeup/pause preservation; active enrollment; no data mutation');
