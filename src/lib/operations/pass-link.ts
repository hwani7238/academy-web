import {attendanceSequence} from './attendance-sequence';
import { type Account, type Invoice, type Attendance, validDay } from './model';

// The existing invoice ID is the stable pass identity; changing dates never changes it.
export function passInvoice(invoice: Invoice, allocated: boolean, stamp: string): Invoice {
  return { ...invoice, passId: invoice.passId || invoice.id, ...(!invoice.passId?{legacyCreditUnits:invoice.creditUnits??invoice.units}:{}),creditUnits: 0,
    allocationState: allocated ? 'allocated' : 'pending',
    allocatedUnits: allocated ? (invoice.allocationState==='allocated'?(invoice.allocatedUnits??invoice.units):invoice.units) : 0,
    ...(allocated ? { allocationAt: invoice.allocationAt || stamp } : {}) };
}
export const passDay = (invoice: Invoice) => invoice.lessonDate || invoice.cycleStart || '';
export function unresolvedReceipts(invoices: Invoice[]) {
  return invoices.filter(i => i.status !== 'cancelled' && !i.reservedPass && i.paid > 0 && (!passDay(i) || i.linkReview));
}
export function requireClearPassLinks(invoices: Invoice[], except = '') {
  if (unresolvedReceipts(invoices).some(i => i.id !== except)) throw Error('연결 확인이 필요한 기존 수납이 있습니다. 청구·수납의 연결 확인에서 먼저 수강권을 연결해주세요.');
}
export function requireUniquePass(invoices: Invoice[], invoice: Invoice, day: string) {
  validDay(day);
  if (invoices.some(i => i.id !== invoice.id && i.status !== 'cancelled' &&
    (passDay(i) === day || (!!invoice.passId && i.passId === invoice.passId)))) throw Error('이 수강권에 연결된 청구가 이미 있습니다. 기존 청구·수납을 확인해주세요.');
}
export function allocatedPass(account: Account, invoice: Invoice, day: string, stamp: string) {
  if (invoice.studentId !== account.id || invoice.status === 'cancelled') throw Error('수강권 연결을 확인해주세요.');
  const already = invoice.allocationState === 'allocated';
  const saved = { ...passInvoice(invoice, true, stamp), lessonDate: validDay(day), updatedAt: stamp };
  return { invoice: saved, account: { ...account,
    remaining: account.remaining + (already ? 0 : invoice.units),
    currentPassId: saved.passId!, currentPassStart: day, updatedAt: stamp } };
}
// Old records keep their existing allocation until the audited migration marks them.
// New passes activate on the first charged lesson, regardless of payment state.
export function lessonPass(account: Account, invoices: Invoice[], day: string, units: number, previous: Attendance | undefined, stamp: string, newId: string, cycleStart = ''): { account:Account; passId?:string; invoice?:Invoice; created?:boolean } {
  if (previous?.passId) return { account, passId: previous.passId };
  if (units <= (previous?.units || 0) || (account.lastPassLessonDay && day < account.lastPassLessonDay)) return { account };
  if (account.currentPassStart && day < account.currentPassStart) return { account };
  const historical = invoices.filter(i => i.passId && i.allocationState === 'allocated' && i.status !== 'cancelled' && passDay(i) && passDay(i) <= day)
    .sort((a,b) => passDay(b).localeCompare(passDay(a)));
  if (account.remaining > 0 && !cycleStart) return { account: { ...account, lastPassLessonDay: day }, passId: account.currentPassId || historical[0]?.passId };
  // An uncertain legacy receipt must not block a child's attendance or manufacture another pass.
  if (account.nextPass || unresolvedReceipts(invoices).length || invoices.some(i=>i.status==='open'&&!i.passId)) return { account };
  const candidates = invoices.filter(i => i.passId && i.allocationState === 'pending' && !i.reservedPass && i.status !== 'cancelled' && (!passDay(i) || passDay(i) <= day));
  if (candidates.length > 1) return { account }; // Owner resolves ambiguous legacy allocations.
  const invoice = candidates[0] || passInvoice({ id:newId,studentId:account.id,name:account.name,units:account.planUnits,amount:account.planAmount,paid:0,status:'open',needsReview:false,createdAt:stamp },false,stamp);
  const start=cycleStart||day;
  requireUniquePass(invoices, invoice, start);
  const activated = allocatedPass(account, invoice, start, stamp);
  return { account: { ...activated.account, lastPassLessonDay: day, openInvoiceId: invoice.status === 'open' ? invoice.id : account.openInvoiceId === invoice.id ? null : account.openInvoiceId },
    invoice: activated.invoice, passId: activated.invoice.passId, created: !candidates.length };
}
export function paymentPass(invoice: Invoice, day: string, invoices: Invoice[], stamp: string) {
  requireClearPassLinks(invoices, invoice.id);
  if (invoice.linkReview) throw Error('연결 확인이 필요한 수강권입니다. 기존 수납을 먼저 확인해주세요.');
  if (!day && !invoice.reservedPass) throw Error('이 수강권의 1회차 날짜를 먼저 연결해주세요.');
  if (day) requireUniquePass(invoices, invoice, day);
  if (!invoice.passId) throw Error('기존 수강권의 횟수 반영 상태를 먼저 확인해주세요. 청구·수납의 연결 확인을 이용해주세요.');
  return { ...invoice, ...(day ? {lessonDate:day} : {}), updatedAt: stamp };
}

export function nextRecordedCycle(account:Account, records:Attendance[], next:Attendance){
 if(!account.currentPassStart||next.day<=account.currentPassStart||next.units<=0||!['present','late_cancel'].includes(next.status||'present'))return '';
 const sequence=attendanceSequence([account],[...records.filter(r=>r.day>=account.currentPassStart!&&r.day<=next.day&&r.day!==next.day),next],[],{positions:{},cycleStarts:[{studentId:account.id,day:account.currentPassStart}]});
 return (sequence.cycleFirstDays[account.id]||[]).filter(day=>day>account.currentPassStart!&&day<=next.day).sort().at(-1)||'';
}
