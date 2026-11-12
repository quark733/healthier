import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import { parseFoodImport, savedMealEntries, scaleEntry, type FoodEntry, type Meal, type SavedMeal } from '../pipeline/foodLog';

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
  const [saved, setSaved] = useState<SavedMeal[]>([]);

  useEffect(() => {
    if (!today) return;
    if (demo) {
      const diary = demoDiary(today);
      setEntries(diary);
      const breakfast = diary.filter((e) => e.date === today && e.meal === 'breakfast');
      // i18n-ignore: the demo's made-up saved meal name
      setSaved([{ id: 'demo-saved', name: 'Breakfast', meal: 'breakfast', items: breakfast.map(({ id: _i, date: _d, meal: _m, ...rest }) => rest) }]);
      return;
    }
    api<{ entries: FoodEntry[] }>('/api/food-log')
      .then((r) => setEntries(r.entries))
      .catch((err) => console.error('Failed to load the food diary:', err));
    api<{ meals: SavedMeal[] }>('/api/saved-meals')
      .then((r) => setSaved(r.meals))
      .catch((err) => console.error('Failed to load saved meals:', err));
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

  /** A new weight for an entry: its numbers scale with it, at once, and are saved. */
  const setGrams = useCallback(
    async (id: string, grams: number) => {
      let before: FoodEntry | undefined;
      setEntries((l) =>
        l.map((e) => {
          if (e.id !== id) return e;
          before = e;
          return scaleEntry(e, grams) ?? e;
        }),
      );
      if (demo) return;
      try {
        const r = await api<{ entry: FoodEntry }>(`/api/food-log/${id}`, { method: 'PATCH', body: { grams } });
        setEntries((l) => l.map((e) => (e.id === id ? r.entry : e)));
      } catch (err) {
        if (before) setEntries((l) => l.map((e) => (e.id === id ? before! : e)));
        throw err;
      }
    },
    [demo],
  );

  /** These entries again on another day (a meal eaten again). */
  const copyTo = useCallback(
    async (list: FoodEntry[], date: CivilDate) => {
      const copies = list.map(({ id: _id, ...e }) => ({ ...e, date }));
      if (demo) {
        setEntries((l) => [...l, ...copies.map((e, i) => ({ ...e, id: `demo-${Date.now()}-${i}` }))]);
        return;
      }
      const r = await api<{ entries: FoodEntry[] }>('/api/food-log', { method: 'POST', body: { entries: copies } });
      setEntries((l) => [...l, ...r.entries]);
    },
    [demo],
  );

  /** These entries saved as a meal under a name (replacing one of the same name). */
  const saveMeal = useCallback(
    async (name: string, meal: Meal, list: FoodEntry[]) => {
      const m: SavedMeal = { name, meal, items: list.map(({ id: _i, date: _d, meal: _m, ...rest }) => rest) };
      if (demo) {
        setSaved((l) => [...l.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { ...m, id: `demo-${Date.now()}` }]);
        return;
      }
      const r = await api<{ meal: SavedMeal }>('/api/saved-meals', { method: 'POST', body: { meal: m } });
      setSaved((l) => [...l.filter((x) => x.id !== r.meal.id), r.meal]);
    },
    [demo],
  );

  /** A saved meal logged on a day. */
  const logSaved = useCallback(
    async (m: SavedMeal, date: CivilDate) => {
      if (demo) {
        setEntries((l) => [...l, ...savedMealEntries(m, date).map((e, i) => ({ ...e, id: `demo-${Date.now()}-${i}` }))]);
        return;
      }
      const r = await api<{ entries: FoodEntry[] }>(`/api/saved-meals/${m.id}/log`, { method: 'POST', body: { date } });
      setEntries((l) => [...l, ...r.entries]);
    },
    [demo],
  );

  const deleteSaved = useCallback(
    async (id: string) => {
      setSaved((l) => l.filter((m) => m.id !== id));
      if (!demo) await api(`/api/saved-meals/${id}`, { method: 'DELETE' });
    },
    [demo],
  );

  return { entries, importText, remove, setGrams, copyTo, saved, saveMeal, logSaved, deleteSaved };
}

export type FoodLog = ReturnType<typeof useFoodLog>;
