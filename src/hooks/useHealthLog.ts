import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import type { LogEntry } from '../pipeline/healthLog';

/** The demo person's log: a cold and a hard week. Made up. */
function demoLog(today: CivilDate): LogEntry[] {
  const d1 = addDays(today, -9);
  const d2 = addDays(today, -3);
  return [
    { id: 'l1', date: d1, at: `${d1}T12:00:00Z`, tag: 'sick', note: '' },
    { id: 'l2', date: d2, at: `${d2}T12:00:00Z`, tag: 'stress', note: '' },
  ];
}

export function useHealthLog(demo: boolean, today: CivilDate) {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (demo) {
      setEntries(demoLog(today));
      return;
    }
    api<{ entries: LogEntry[] }>('/api/log')
      .then((r) => setEntries(r.entries))
      .catch((err) => console.error('Failed to load the health log:', err));
  }, [demo, today]);

  const add = useCallback(
    async (e: LogEntry) => {
      if (demo) {
        setEntries((l) => [...l, { ...e, id: `demo-${Date.now()}` }]);
        return;
      }
      const r = await api<{ entry: LogEntry }>('/api/log', { method: 'POST', body: { entry: e } });
      setEntries((l) => [...l, r.entry]);
    },
    [demo],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((l) => l.filter((e) => e.id !== id));
      if (!demo) await api(`/api/log/${id}`, { method: 'DELETE' });
    },
    [demo],
  );

  return { entries, add, remove };
}
