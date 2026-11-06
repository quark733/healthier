import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LabResult } from '../pipeline/bloodwork';
import { markerFor } from '../pipeline/bloodwork';

/**
 * The demo person's blood tests: two made-up reports a few months apart, mostly in range, with an
 * LDL above the goal and vitamin D low in winter, so every part of the page has something to show.
 * Not a real person's results.
 */
function demoLabs(): LabResult[] {
  const rows: [string, number, string, number | null, number | null][] = [
    // name, value, unit, ref low, ref high (i18n-ignore: lab names as a Swedish report prints them)
    ['S-Apolipoprotein B', 1.05, 'g/L', 0.6, 1.6], // i18n-ignore
    ['S-LDL-kolesterol', 3.6, 'mmol/L', 1.2, 4.3], // i18n-ignore
    ['fS-HDL-kolesterol', 1.5, 'mmol/L', 0.8, 2.1], // i18n-ignore
    ['fS-Triglycerider', 0.9, 'mmol/L', 0.45, 2.6], // i18n-ignore
    ['S-Kolesterol', 5.4, 'mmol/L', 2.9, 6.1], // i18n-ignore
    ['P-Glukos', 5.1, 'mmol/L', 4.0, 6.0], // i18n-ignore
    ['B-HbA1c', 34, 'mmol/mol', 27, 42], // i18n-ignore
    ['B-Hemoglobin', 138, 'g/L', 117, 153], // i18n-ignore
    ['S-Ferritin', 28, 'µg/L', 13, 150], // i18n-ignore
    ['S-25-OH-vitamin D', 48, 'nmol/L', 25, 105], // i18n-ignore
    ['S-Kobalamin, B12', 410, 'pmol/L', 140, 650], // i18n-ignore
    ['S-CRP', 0.8, 'mg/L', null, 5], // i18n-ignore
    ['S-TSH, tyreotropin', 2.1, 'mE/L', 0.4, 4.0], // i18n-ignore
    ['S-Cystatin C', 0.81, 'mg/L', 0.6, 1.1], // i18n-ignore
    ['S-ALAT', 0.42, 'µkat/L', null, 0.76], // i18n-ignore
  ];
  const earlier: Record<string, number> = { 'S-LDL-kolesterol': 3.9, 'S-25-OH-vitamin D': 71, 'S-Apolipoprotein B': 1.12, 'S-Ferritin': 35 }; // i18n-ignore
  const out: LabResult[] = [];
  for (const [name, value, unit, refLow, refHigh] of rows) {
    const marker = markerFor(name)?.id ?? null;
    out.push({ date: '2026-09-28', name, marker, value, cmp: null, unit, refLow, refHigh });
    if (earlier[name] !== undefined) out.push({ date: '2026-04-14', name, marker, value: earlier[name], cmp: null, unit, refLow, refHigh });
  }
  return out;
}

export interface LabsState {
  results: LabResult[];
  loaded: boolean;
  importText: (text: string) => Promise<{ imported: number; unread: number }>;
  clear: () => Promise<void>;
}

export function useLabs(demo: boolean): LabsState {
  const [results, setResults] = useState<LabResult[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      setResults(demoLabs());
      setLoaded(true);
      return;
    }
    try {
      const r = await api<{ results: LabResult[] }>('/api/labs');
      setResults(r.results);
    } finally {
      setLoaded(true);
    }
  }, [demo]);

  useEffect(() => {
    load().catch((err) => console.error('Failed to load blood tests:', err));
  }, [load]);

  const importText = useCallback(
    async (text: string) => {
      if (demo) return { imported: 0, unread: 0 };
      const r = await api<{ imported: number; unread: number }>('/api/labs/import', { method: 'POST', body: { text } });
      await load();
      return r;
    },
    [demo, load],
  );

  const clear = useCallback(async () => {
    if (demo) return;
    await api('/api/labs', { method: 'DELETE' });
    await load();
  }, [demo, load]);

  return { results, loaded, importText, clear };
}
