export const ATTENDANCE_POLL_MS = 5000;
const FULL_REFRESH_MS = 30000;

// Read a small revision first; reload the ledger only when it changed or is due.
// A revision read before the snapshot ensures arrivals during loading are not lost.
export function autoRefresh(options: {
  revision: () => Promise<string>;
  refresh: () => Promise<boolean>;
  visible: () => boolean;
  now?: () => number;
}) {
  const now = options.now || Date.now;
  let stopped = false, running = false, queued = false;
  let revision: string | undefined;
  let refreshedAt = -Infinity;
  async function check(force = false): Promise<void> {
    if (stopped || !options.visible()) return;
    if (running) { queued ||= force; return; }
    running = true;
    try {
      let next: string | undefined;
      try { next = await options.revision(); } catch { /* Full refresh also retries connectivity/authentication. */ }
      if (stopped || !options.visible()) return;
      if (force || next !== revision || now() - refreshedAt >= FULL_REFRESH_MS) {
        if (await options.refresh() && !stopped) {
          revision = next;
          refreshedAt = now();
        }
      }
    } finally {
      running = false;
      if (queued && !stopped) { queued = false; await check(true); }
    }
  }
  return { check, stop: () => { stopped = true; queued = false; } };
}
