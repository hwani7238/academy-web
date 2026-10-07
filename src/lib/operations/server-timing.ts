export function serverTiming() {
  const entries: string[] = [];
  return {
    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try { return await work(); }
      finally { entries.push(`${name};dur=${(performance.now() - start).toFixed(1)}`); }
    },
    header: () => entries.join(', '),
  };
}
