/** Coalesce push events, preserve changes arriving during a fetch, and retry only
 * a failed fetch. There is deliberately no healthy-state polling timer. */
export function liveRefresh(options: {
  refresh: () => Promise<boolean>;
  visible: () => boolean;
  delay?: (work: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const delay = options.delay || setTimeout, cancel = options.cancel || clearTimeout;
  let stopped = false, running = false, dirty = false, retryMs = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule(ms: number) {
    if (stopped || running || timer !== undefined || !options.visible()) return;
    timer = delay(() => { timer = undefined; void run(); }, ms);
  }
  async function run() {
    if (stopped || running || !dirty || !options.visible()) return;
    running = true; dirty = false;
    let ok = false;
    try { ok = await options.refresh(); } catch { /* Retry the failed refresh. */ }
    running = false;
    if (stopped) return;
    if (ok) retryMs = 1000;
    else { dirty = true; retryMs = Math.min(retryMs * 2, 30000); }
    if (dirty) schedule(ok ? 150 : retryMs);
  }
  return {
    changed() { dirty = true; schedule(150); },
    stop() { stopped = true; dirty = false; if (timer !== undefined) cancel(timer); },
  };
}
