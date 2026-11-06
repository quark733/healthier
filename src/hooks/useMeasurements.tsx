import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import type { Measurement } from '../pipeline/measurements';

/** The demo person's readings: a measuring week of blood pressure, and a weekly waist. Made up. */
function demoMeasurements(today: CivilDate): Measurement[] {
  const out: Measurement[] = [];
  for (let i = 6; i >= 1; i--) {
    const date = addDays(today, -i);
    out.push({ id: `d${i}m`, kind: 'bp', at: `${date}T07:10:00+02:00`, date, sys: 124 + (i % 3), dia: 79 + (i % 2), pulse: 58 + (i % 4) });
    out.push({ id: `d${i}e`, kind: 'bp', at: `${date}T21:30:00+02:00`, date, sys: 121 + (i % 2), dia: 77, pulse: 62 });
  }
  for (let w = 8; w >= 0; w--) {
    const date = addDays(today, -7 * w);
    out.push({ id: `w${w}`, kind: 'waist', at: `${date}T07:05:00+02:00`, date, cm: 84 + w * 0.4 });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

interface MeasurementsValue {
  list: Measurement[];
  add: (m: Measurement) => Promise<void>;
  remove: (id: string) => Promise<void>;
  loaded: boolean;
}

const Ctx = createContext<MeasurementsValue>({ list: [], add: async () => {}, remove: async () => {}, loaded: false });

/** Blood pressure and waist, shared by Today's row and the Body page's card. */
export function MeasurementsProvider({ demo, today, children }: { demo: boolean; today: CivilDate | null; children: React.ReactNode }) {
  const [list, setList] = useState<Measurement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (demo) {
      setList(today ? demoMeasurements(today) : []);
      setLoaded(true);
      return;
    }
    api<{ measurements: Measurement[] }>('/api/measurements')
      .then((r) => setList(r.measurements))
      .catch((err) => console.error('Failed to load measurements:', err))
      .finally(() => setLoaded(true));
  }, [demo, today]);

  const add = useCallback(
    async (m: Measurement) => {
      if (demo) {
        setList((l) => [...l, { ...m, id: `demo-${Date.now()}` }]);
        return;
      }
      const r = await api<{ measurement: Measurement }>('/api/measurements', { method: 'POST', body: { measurement: m } });
      setList((l) => [...l, r.measurement].sort((a, b) => (a.at < b.at ? -1 : 1)));
    },
    [demo],
  );

  const remove = useCallback(
    async (id: string) => {
      setList((l) => l.filter((m) => m.id !== id));
      if (!demo) await api(`/api/measurements/${id}`, { method: 'DELETE' });
    },
    [demo],
  );

  return <Ctx.Provider value={{ list, add, remove, loaded }}>{children}</Ctx.Provider>;
}

export const useMeasurements = () => useContext(Ctx);
