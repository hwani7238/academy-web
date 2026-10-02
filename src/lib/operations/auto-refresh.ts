export const ATTENDANCE_POLL_MS = 5000;
const FULL_REFRESH_MS = 30000;
const RESUME_DEBOUNCE_MS = 1000;

// One authenticated request checks the revision and, when needed, returns a snapshot.
// The server reads the revision before the ledger so arrivals during loading are
// still detected by the next poll. Failed/skipped refreshes never consume it.
export function autoRefresh(options: {
  refresh: (since?: string) => Promise<false | { revision: string; refreshed: boolean }>;
  visible: () => boolean;
  now?: () => number;
}) {
  const now = options.now || Date.now;
  let stopped = false, running = false, queued = false;
  let revision: string | undefined;
  let refreshedAt = -Infinity, forcedAt = -Infinity;
  async function check(force = false): Promise<void> {
    if (stopped || !options.visible()) return;
    if (force && now() - forcedAt < RESUME_DEBOUNCE_MS) return;
    if (force) forcedAt = now();
    if (running) { queued ||= force; return; }
    running = true;
    try {
      const result = await options.refresh(force || now() - refreshedAt >= FULL_REFRESH_MS ? undefined : revision);
      if (result && !stopped) {
        revision = result.revision;
        if (result.refreshed) refreshedAt = now();
      }
    } finally {
      running = false;
      if (queued && !stopped) { queued = false; forcedAt = -Infinity; await check(true); }
    }
  }
  return { check, stop: () => { stopped = true; queued = false; } };
}
