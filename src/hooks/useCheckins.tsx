import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import type { Checkin } from '../pipeline/checkin';

/** The demo person's mornings: mostly fine, a rough one now and then. Made up. */
function demoCheckins(today: CivilDate): Checkin[] {
  return Array.from({ length: 28 }, (_, i) => {
    const date = addDays(today, i - 28);
    const late = i % 4 === 1;
    const rough = i % 9 === 4;
    return { date, sleep: rough ? 2 : late ? 3 : 4, fatigue: rough ? 2 : 4, soreness: i % 3 === 0 ? 3 : 4, stress: 3, mood: rough ? 3 : 4, lateCaffeine: late };
  });
}

interface CheckinsValue {
  checkins: Checkin[];
  save: (c: Checkin) => Promise<void>;
  loaded: boolean;
}

const CheckinsContext = createContext<CheckinsValue>({ checkins: [], save: async () => {}, loaded: false });

/** The morning check-ins, shared by Today's check-in card and the training dose. */
export function CheckinsProvider({ demo, today, children }: { demo: boolean; today: CivilDate | null; children: React.ReactNode }) {
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (demo) {
      setCheckins(today ? demoCheckins(today) : []);
      setLoaded(true);
      return;
    }
    api<{ checkins: Checkin[] }>('/api/checkins')
      .then((r) => setCheckins(r.checkins))
      .catch((err) => console.error('Failed to load check-ins:', err))
      .finally(() => setLoaded(true));
  }, [demo, today]);

  const save = useCallback(
    async (c: Checkin) => {
      setCheckins((list) => [...list.filter((x) => x.date !== c.date), c].sort((a, b) => (a.date < b.date ? -1 : 1)));
      if (demo) return;
      await api('/api/checkins', { method: 'PUT', body: { checkin: c } });
    },
    [demo],
  );

  return <CheckinsContext.Provider value={{ checkins, save, loaded }}>{children}</CheckinsContext.Provider>;
}

export const useCheckins = () => useContext(CheckinsContext);
