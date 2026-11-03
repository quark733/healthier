import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { EMPTY_TARGETS, type Targets } from '../pipeline/targets';

/** The demo person's targets: a modest deficit and plenty of protein. */
const DEMO_TARGETS: Targets = { kcal: 2200, proteinG: 150, carbsG: 220, fatG: 70, weightKg: 76, weightBy: '2027-06-01' };

interface TargetsContextValue {
  targets: Targets;
  save: (next: Targets) => Promise<void>;
  loaded: boolean;
}

const TargetsContext = createContext<TargetsContextValue>({ targets: EMPTY_TARGETS, save: async () => {}, loaded: false });

/** The person's food and weight targets, shared by Today and the Nutrition page. */
export function TargetsProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const [targets, setTargets] = useState<Targets>(demo ? DEMO_TARGETS : EMPTY_TARGETS);
  const [loaded, setLoaded] = useState(demo);

  useEffect(() => {
    if (demo) {
      setTargets(DEMO_TARGETS);
      setLoaded(true);
      return;
    }
    api<{ targets: Targets }>('/api/targets')
      .then((r) => setTargets(r.targets))
      .catch((err) => console.error('Failed to load targets:', err))
      .finally(() => setLoaded(true));
  }, [demo]);

  const save = useCallback(
    async (next: Targets) => {
      setTargets(next);
      if (demo) return;
      const r = await api<{ targets: Targets }>('/api/targets', { method: 'PUT', body: { targets: next } });
      setTargets(r.targets);
    },
    [demo],
  );

  return <TargetsContext.Provider value={{ targets, save, loaded }}>{children}</TargetsContext.Provider>;
}

export const useTargets = () => useContext(TargetsContext);
