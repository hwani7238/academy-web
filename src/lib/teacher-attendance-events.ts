type Options = {
  token: () => Promise<string>;
  changed: () => void;
  connected: (value: boolean) => void;
  denied: (status: number) => void;
};
// One streaming connection per visible page. Reconnects recover from transport
// failure; no timer fetches attendance records while the connection is healthy.
export function watchTeacherAttendance(options: Options) {
  let stopped = false, delay = 1000;
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  async function connect() {
    if (stopped) return;
    const active = new AbortController(); controller = active;
    // Abort a silent/dead connection, including stalled response headers.
    let watchdog = setTimeout(()=>active.abort(),45000);
    const alive = () => { clearTimeout(watchdog); watchdog = setTimeout(()=>active.abort(),45000); };
    try {
      const token = await options.token(); if (stopped) return;
      const response = await fetch('/api/teacher/attendance/events',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:active.signal});
      if ([401,403].includes(response.status)) { stopped = true; options.denied(response.status); return; }
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw Error('stream unavailable');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
      try {
        while (!stopped) {
          const {done,value} = await reader.read(); if(done)break;
          alive(); pending += decoder.decode(value,{stream:true});
          let end: number;
          while ((end=pending.indexOf('\n\n'))>=0) {
            const event=pending.slice(0,end);pending=pending.slice(end+2);
            const line=event.split('\n').find(part=>part.startsWith('data: '));
            if(!line)continue;
            const data=JSON.parse(line.slice(6));
            if (stopped) break;
            if(data.type==='denied'){stopped=true;options.denied(403);return;}
            if(data.type==='retry')throw Error('stream unavailable');
            if(data.type==='changed'){delay=1000;options.connected(true);options.changed();}
          }
        }
      } finally { await reader.cancel().catch(()=>{}); }
    } catch { /* Show disconnected state and retry the transport below. */ }
    finally {
      clearTimeout(watchdog); active.abort();
      if (!stopped) { options.connected(false); timer=setTimeout(()=>void connect(),delay);delay=Math.min(delay*2,30000); }
    }
  }
  void connect();
  return () => { stopped=true;clearTimeout(timer);controller?.abort(); };
}
