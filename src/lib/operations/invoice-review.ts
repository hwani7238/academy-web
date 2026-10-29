import type { Invoice } from './model';

export type InvoiceReviewReason = {
  kind: 'balance_changed' | 'attendance_changed' | 'attendance_cancelled';
  day?: string;
  beforeRemaining: number;
  afterRemaining: number;
};

export function invoiceReviewPatch(reviewReason: InvoiceReviewReason, updatedAt: string) {
  return { needsReview: true, reviewReason, updatedAt };
}

export function invoiceReviewMessage(invoice: Invoice) {
  const reason = invoice.reviewReason;
  if (!reason) return '기존 청구 내용을 다시 확인해주세요.';
  const day = reason.day ? `${Number(reason.day.slice(5, 7))}/${Number(reason.day.slice(8))} ` : '';
  if (reason.kind === 'attendance_cancelled') return `${day}출석이 취소됐어요. 기존 청구를 유지할까요?`;
  if (reason.kind === 'attendance_changed') return `${day}출결 차감 횟수가 변경됐어요. 기존 청구를 유지할까요?`;
  return '잔여 횟수가 변경됐어요. 기존 청구를 유지할까요?';
}

// Bind an owner's choice to the details they actually saw, including old invoices
// whose review flag was recorded without a timestamp.
export function invoiceReviewRevision(invoice: Invoice) {
  return JSON.stringify([invoice.updatedAt || '', invoice.status, invoice.needsReview, invoice.units, invoice.amount, invoice.paid, invoice.lessonDate || '', invoice.cycleStart || '', invoice.reviewReason || null]);
}
