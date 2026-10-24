export interface FeedbackState {
  viewed?: boolean;
  viewCount?: number;
  firstViewedAt?: unknown;
  lastViewedAt?: unknown;
  authorId?: string;
  editRevision?: number;
  progress?: string;
  feedback?: string;
}
export interface FeedbackActor { uid: string; role?: string; status?: string }
export const feedbackViewed = (log: FeedbackState) => Boolean(log.viewed || (log.viewCount ?? 0) > 0 || log.firstViewedAt || log.lastViewedAt);
export const feedbackStaff = (actor: FeedbackActor) => ['admin','wonjang','siljang'].includes(actor.role || '') || (actor.role === 'teacher' && (!actor.status || actor.status === 'approved'));
export const canEditFeedback = (log: FeedbackState, actor: FeedbackActor) => feedbackStaff(actor) && !feedbackViewed(log) && (actor.role !== 'teacher' || log.authorId === actor.uid);
export class FeedbackError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function feedbackEdit(log: FeedbackState, actor: FeedbackActor, input: Record<string, unknown>) {
  if (!feedbackStaff(actor) || (actor.role === 'teacher' && log.authorId !== actor.uid)) throw new FeedbackError('본인이 작성한 피드백만 수정할 수 있습니다.',403);
  if (feedbackViewed(log)) throw new FeedbackError('부모님이 이미 확인한 피드백은 수정할 수 없습니다.',409);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (log.editRevision ?? 0)) throw new FeedbackError('다른 곳에서 수정되었습니다. 창을 닫고 최신 내용을 확인해주세요.',409);
  if (Object.keys(input).some(key => !['progress','feedback','expectedRevision'].includes(key))) throw new FeedbackError('수정할 수 없는 항목입니다.');
  if (typeof input.progress !== 'string' || typeof input.feedback !== 'string' || input.progress.length > 2000 || input.feedback.length > 20000) throw new FeedbackError('진도와 피드백 내용을 확인해주세요.');
  return {progress: input.progress, feedback: input.feedback, editRevision: (log.editRevision ?? 0) + 1};
}
