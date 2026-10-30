import { attendanceSequence } from './attendance-sequence';
import { confirmedPassLessons, isFirstLesson, legacyAttendanceAppearance } from './attendance-appearance';
import { invoiceCycleStart } from './billing-display';
import { seoulDay, type Snapshot } from './model';

// Resolve display/payment defaults from lesson evidence without changing receipts,
// balances or stored pass links. Ambiguous legacy bills still need owner review.
export function attendanceInvoiceDates(data: Snapshot, today = seoulDay()) {
  const records = [...data.attendance, ...(data.forecastAttendance || [])];
  const sequence = attendanceSequence(data.accounts, records, data.legacyAttendance || [], data.sequenceContext);
  const invoices = [...data.invoices, ...(data.settledInvoices || [])];
  const confirmed = confirmedPassLessons(invoices, records, sequence.cycleFirstDays, sequence.firstLessonTimes, sequence.labels);
  const occupied = new Set(invoices.filter(i => i.status !== 'cancelled' && (i.lessonDate || i.cycleStart))
    .map(i => `${i.studentId}_${i.lessonDate || i.cycleStart}`));
  const marked = new Set([...(data.unpaidCycleKeys || []), ...records.filter(r => r.status === 'present' && r.unpaidCycleStart)
    .map(r => `${r.studentId}_${r.unpaidCycleStart}`)]);
  const firsts = new Set<string>();
  const actual = new Map(records.map(r => [`${r.studentId}_${r.day}`, r]));
  for (const row of records) {
    const key = `${row.studentId}_${row.day}`;
    if (row.day <= today && isFirstLesson(sequence.labels.get(key), row.status)) firsts.add(key);
  }
  const ledger = new Map([...(data.sequenceContext?.references || []), ...(data.legacyAttendance || [])]
    .map(row => [`${row.studentId}_${row.day}`, row]));
  for (const row of ledger.values()) {
    const key = `${row.studentId}_${row.day}`, tone = legacyAttendanceAppearance(row).tone;
    if (!actual.has(key) && row.day <= today && ['present', 'payment-due', 'late_cancel'].includes(tone)
      && isFirstLesson(sequence.labels.get(key) || row.value, 'present')) firsts.add(key);
  }
  // Prior-month unpaid starts are carried by the API's sequence context.
  for (const key of marked) {
    const id = key.slice(0, -11), day = key.slice(-10);
    if (day <= today && !actual.has(key) && sequence.cycleFirstDays[id]?.includes(day)) firsts.add(key);
  }
  const dates: Record<string, string> = {};
  for (const invoice of invoices) {
    const explicit = invoice.lessonDate || invoice.cycleStart;
    if (explicit) { dates[invoice.id] = explicit; continue; }
    if (invoice.status !== 'open' || invoice.reservedPass) continue;
    const siblings = invoices.filter(i => i.studentId === invoice.studentId && i.status !== 'cancelled');
    const unknown = siblings.filter(i => i.status === 'open' && !i.reservedPass && !i.lessonDate && !i.cycleStart);
    const candidates = [...firsts].filter(key => key.slice(0, -11) === invoice.studentId && !confirmed.has(key)
      && !occupied.has(key) && !data.cancelledInvoiceKeys?.includes(key));
    const linked = invoice.passId ? candidates.filter(key => actual.get(key)?.passId === invoice.passId) : [];
    // Unmarked lessons remain ambiguous when old receipts are unlinked.
    // Explicit unpaid attendance can date an existing bill for display, but
    // never links that old receipt or creates another debt.
    const uncertainReceipt = siblings.some(i => i.id !== invoice.id && i.paid > 0 && (!i.lessonDate && !i.cycleStart || i.linkReview));
    const unpaid = candidates.filter(key => marked.has(key));
    const choices = linked.length ? linked : unpaid.length ? unpaid : candidates;
    if (unknown.length === 1 && (!uncertainReceipt || linked.length > 0 || unpaid.length > 0) && choices.length === 1) {
      dates[invoice.id] = choices[0].slice(-10);
    } else {
      const inferred = invoiceCycleStart(invoice, sequence.cycleFirstDays, sequence.firstLessonTimes);
      if (inferred && !occupied.has(`${invoice.studentId}_${inferred}`)) dates[invoice.id] = inferred;
    }
  }
  return dates;
}
