import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { demoStrengthSessions } from '../pipeline/strength-demo';
import type { StrengthResponse } from '../types/api';

const DEMO: StrengthResponse = {
  sessions: demoStrengthSessions(),
  connected: true,
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  unread: 0,
  via: 'sync',
};

/** Strength sessions and the StrengthLog link; asks again every few seconds while a sync runs. */
export function useStrength(demo: boolean) {
  const [data, setData] = useState<StrengthResponse | null>(demo ? DEMO : null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (demo) return setData(DEMO);
    try {
      setData(await api<StrengthResponse>('/api/strength'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [demo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.syncing) return;
    const timer = setTimeout(() => void load(), 4000);
    return () => clearTimeout(timer);
  }, [data, load]);

  const sync = useCallback(async () => {
    if (demo) return;
    await api('/api/strength/sync', { method: 'POST' });
    setData((d) => (d ? { ...d, syncing: true } : d));
    setTimeout(() => void load(), 1500);
  }, [demo, load]);

  const importText = useCallback(
    async (text: string) => {
      const result = await api<{ sessions: number; unread: number }>('/api/strength/import', { method: 'POST', body: { text } });
      await load();
      return result;
    },
    [load],
  );

  const disconnect = useCallback(async () => {
    await api('/api/strength', { method: 'DELETE' });
    await load();
  }, [load]);

  return { data, error, reload: load, sync, importText, disconnect };
}
