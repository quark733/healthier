import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import { parseFoodImport, type FoodEntry } from '../pipeline/foodLog';

/** The demo person's diary: yesterday and today so far. Made up. */
function demoDiary(today: CivilDate): FoodEntry[] {
  const y = addDays(today, -1);
  // i18n-ignore: made-up foods for the demo diary, data rather than page text
  const lines = `${y};breakfast;Porridge oats;80;300;10;50;6;1;0
${y};breakfast;Blueberries;100;50;0.5;12;0.5;0;0
${y};lunch;Chicken breast;150;165;35;0;2.5;0.7;0.2
${y};lunch;Rice, cooked;250;325;6.5;70;0.8;0.2;0
${y};dinner;Salmon;150;310;30;0;21;4;0.2
${y};dinner;Potatoes;300;230;6;51;0.3;0.1;0
${y};evening;Greek yoghurt 0 %;200;118;19;8;0.4;0.2;0.3
${today};breakfast;Porridge oats;80;300;10;50;6;1;0
${today};breakfast;Banana;120;105;1;26;0;0;0`;
  return parseFoodImport(lines).entries.map((e, i) => ({ ...e, id: `demo${i}` }));
}

/** The food diary (pipeline/foodLog.ts): read once, changed in place. */
export function useFoodLog(demo: boolean, today: CivilDate | null) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);

  useEffect(() => {
    if (!today) return;
    if (demo) {
      setEntries(demoDiary(today));
      return;
    }
    api<{ entries: FoodEntry[] }>('/api/food-log')
      .then((r) => setEntries(r.entries))
      .catch((err) => console.error('Failed to load the food diary:', err));
  }, [demo, today]);

  /** Pasted lines; each day in them replaces what it had. Returns the lines it couldn't read. */
  const importText = useCallback(
    async (text: string): Promise<{ saved: number; unread: string[] }> => {
      if (demo) {
        const { entries: read, unread } = parseFoodImport(text);
        const dates = new Set(read.map((e) => e.date));
        setEntries((l) => [...l.filter((e) => !dates.has(e.date)), ...read.map((e, i) => ({ ...e, id: `demo-${Date.now()}-${i}` }))]);
        return { saved: read.length, unread };
      }
      const r = await api<{ saved: number; unread: string[] }>('/api/food-log/import', { method: 'POST', body: { text } });
      const fresh = await api<{ entries: FoodEntry[] }>('/api/food-log');
      setEntries(fresh.entries);
      return r;
    },
    [demo],
  );

  const remove = useCallback(
    async (id: string) => {
      setEntries((l) => l.filter((e) => e.id !== id));
      if (!demo) await api(`/api/food-log/${id}`, { method: 'DELETE' });
    },
    [demo],
  );

  return { entries, importText, remove };
}

export type FoodLog = ReturnType<typeof useFoodLog>;
