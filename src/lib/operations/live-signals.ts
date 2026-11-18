import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { liveRefresh } from './live-refresh';

/** Listen directly to a single protected revision document, never ledger rows. */
export function watchOperations(options: {
  topic?: 'operations' | 'integrity';
  refresh: () => Promise<boolean>;
  failed: (message: string) => void;
}) {
  let stopped = false, unsubscribe: (() => void) | undefined;
  const live = liveRefresh({ refresh: options.refresh, visible: () => document.visibilityState === 'visible' });
  function resume() {
    if (stopped) return;
    if (document.visibilityState !== 'visible') { unsubscribe?.(); unsubscribe = undefined; return; }
    if (unsubscribe) return;
    let revision: string | undefined;
    unsubscribe = onSnapshot(doc(db, 'opsSignals', options.topic || 'operations'), { includeMetadataChanges: true }, snapshot => {
      // Wait for the server's initial snapshot: cached metadata must not race a
      // fresh ledger read. Reconnects always load once to recover missed changes.
      if (snapshot.metadata.fromCache) return;
      const next = String(snapshot.data()?.revision || 'initial');
      if (next !== revision) { revision = next; live.changed(); }
    }, () => {
      // Do not silently fall back to polling or claim the stale screen is live.
      unsubscribe = undefined;
      options.failed('실시간 연결을 확인하지 못했습니다. 화면을 다시 열어주세요.');
    });
  }
  function reconnect() { unsubscribe?.(); unsubscribe = undefined; resume(); }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('online', reconnect);
  resume();
  return () => {
    stopped = true; live.stop(); unsubscribe?.();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('focus', resume);
    window.removeEventListener('online', reconnect);
  };
}
