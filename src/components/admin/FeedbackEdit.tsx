'use client';
import {useEffect,useRef,useState} from 'react';
import {auth} from '@/lib/firebase';
import {canEditFeedback,feedbackViewed,type FeedbackState,type FeedbackActor} from '@/lib/feedback/policy';
import {Button} from '@/components/ui/button';

export function FeedbackEdit({studentId,logId,log,actor}:{studentId:string;logId:string;log:FeedbackState;actor:FeedbackActor}) {
  const [open,setOpen]=useState(false);
  return <>{canEditFeedback(log,actor)&&<Button variant="outline" size="sm" onClick={()=>setOpen(true)} className="h-7 text-xs">수정</Button>}{open&&<FeedbackEditor studentId={studentId} logId={logId} log={log} close={()=>setOpen(false)}/>}</>;
}
function FeedbackEditor({studentId,logId,log,close}:{studentId:string;logId:string;log:FeedbackState;close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  const [progress,setProgress]=useState(log.progress||''),[feedback,setFeedback]=useState(log.feedback||'');
  const [revision]=useState(log.editRevision??0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const viewed=feedbackViewed(log),changed=revision!==(log.editRevision??0);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} aria-labelledby="feedback-edit-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border bg-white p-5 shadow-xl backdrop:bg-black/40" onCancel={e=>{e.preventDefault();if(!lock.current)close();}}>
    <div className="flex items-center justify-between"><h2 id="feedback-edit-title" className="text-lg font-bold">피드백 수정</h2><Button variant="ghost" size="sm" aria-label="닫기" disabled={busy} onClick={close}>×</Button></div>
    <p className="my-3 text-sm text-slate-500">저장하면 기존 알림톡 링크에 수정한 내용이 반영됩니다. 알림톡은 다시 발송하지 않습니다.</p>
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(lock.current||viewed||changed)return;lock.current=true;setBusy(true);setError('');try{
      const token=await auth.currentUser?.getIdToken();if(!token)throw Error('다시 로그인해주세요.');
      const response=await fetch(`/api/feedback/${encodeURIComponent(studentId)}/${encodeURIComponent(logId)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({progress,feedback,expectedRevision:revision})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'저장하지 못했습니다.');close();
    }catch(err){setError(err instanceof Error?err.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}}>
      <label className="block text-sm font-medium">현재 진도<input className="mt-1 w-full rounded border p-2" maxLength={2000} value={progress} onChange={e=>setProgress(e.target.value)} disabled={busy||viewed||changed}/></label>
      <label className="block text-sm font-medium">피드백 내용<textarea className="mt-1 w-full rounded border p-2" rows={9} maxLength={20000} value={feedback} onChange={e=>setFeedback(e.target.value)} disabled={busy||viewed||changed}/></label>
      <p className="text-xs text-slate-500">기존 사진과 영상은 유지됩니다.</p>
      {(viewed||changed||error)&&<p role="alert" className="text-sm text-red-600">{viewed?'부모님이 이미 확인하여 수정할 수 없습니다.':changed?'다른 곳에서 수정되었습니다. 창을 닫고 최신 내용을 확인해주세요.':error}</p>}
      <Button type="submit" className="w-full" disabled={busy||viewed||changed}>{busy?'저장 중…':'저장'}</Button>
    </form>
  </dialog>;
}
