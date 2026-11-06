import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { addDays, type CivilDate } from '../lib/date';
import { EMPTY_PLAN, type CareEvent, type CarePlan } from '../pipeline/care';

/** The demo person's plan and log: made up, so every part of the cards has something to show. */
function demoCare(today: CivilDate): { plan: CarePlan; events: CareEvent[] } {
  const plan: CarePlan = { clotHistory: true, anticoagulant: 'Apixaban', dosesPerDay: 2, trackDoses: true, contact: '', notes: '' }; // i18n-ignore: a medicine's name
  const events: CareEvent[] = [];
  for (let i = 13; i >= 1; i--) {
    const date = addDays(today, -i);
    events.push({ id: `m${i}`, kind: 'dose', date, at: `${date}T07:30:00Z`, slot: 'morning' });
    if (i !== 5) events.push({ id: `e${i}`, kind: 'dose', date, at: `${date}T19:30:00Z`, slot: 'evening' });
  }
  events.push({ id: 'ev1', kind: 'event', date: addDays(today, -9), at: `${addDays(today, -9)}T12:00:00Z`, tag: 'sick', note: '' });
  events.push({ id: 'ev2', kind: 'event', date: addDays(today, -3), at: `${addDays(today, -3)}T12:00:00Z`, tag: 'stress', note: '' });
  return { plan, events };
}

interface CareValue {
  plan: CarePlan;
  events: CareEvent[];
  loaded: boolean;
  savePlan: (p: CarePlan) => Promise<void>;
  addEvent: (e: CareEvent) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
}

const Ctx = createContext<CareValue>({ plan: EMPTY_PLAN, events: [], loaded: false, savePlan: async () => {}, addEvent: async () => {}, removeEvent: async () => {} });

export function CareProvider({ demo, today, children }: { demo: boolean; today: CivilDate | null; children: React.ReactNode }) {
  const [plan, setPlan] = useState<CarePlan>(EMPTY_PLAN);
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (demo) {
      const d = today ? demoCare(today) : { plan: EMPTY_PLAN, events: [] };
      setPlan(d.plan);
      setEvents(d.events);
      setLoaded(true);
      return;
    }
    api<{ plan: CarePlan; events: CareEvent[] }>('/api/care')
      .then((r) => {
        setPlan(r.plan);
        setEvents(r.events);
      })
      .catch((err) => console.error('Failed to load the care plan:', err))
      .finally(() => setLoaded(true));
  }, [demo, today]);

  const savePlan = useCallback(
    async (p: CarePlan) => {
      if (demo) {
        setPlan(p);
        return;
      }
      const r = await api<{ plan: CarePlan }>('/api/care/plan', { method: 'PUT', body: { plan: p } });
      setPlan(r.plan);
    },
    [demo],
  );

  const addEvent = useCallback(
    async (e: CareEvent) => {
      if (demo) {
        setEvents((l) => [...l, { ...e, id: `demo-${Date.now()}` }]);
        return;
      }
      const r = await api<{ event: CareEvent }>('/api/care/events', { method: 'POST', body: { event: e } });
      setEvents((l) => [...l, r.event]);
    },
    [demo],
  );

  const removeEvent = useCallback(
    async (id: string) => {
      setEvents((l) => l.filter((e) => e.id !== id));
      if (!demo) await api(`/api/care/events/${id}`, { method: 'DELETE' });
    },
    [demo],
  );

  return <Ctx.Provider value={{ plan, events, loaded, savePlan, addEvent, removeEvent }}>{children}</Ctx.Provider>;
}

export const useCare = () => useContext(Ctx);
