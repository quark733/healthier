import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { useTargets } from '../hooks/useTargets';
import { readTargets, type Targets } from '../pipeline/targets';
import { Card, CardHead } from '../ui/primitives';

/** The person's food and weight targets, typed in: the same numbers as in their food diary app. */
export function TargetsCard() {
  const { targets, save } = useTargets();
  const [draft, setDraft] = useState<Record<keyof Targets, string>>(() => toDraft(targets));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => setDraft(toDraft(targets)), [targets]);

  const field = (key: keyof Targets, label: string, unit: string, type: 'number' | 'date' = 'number') => (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-zinc-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={draft[key]}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [key]: e.target.value }));
            setState('idle');
          }}
          className="w-full min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-detail text-zinc-100 tabular-nums"
        />
        {unit && <span className="text-caption text-zinc-500">{unit}</span>}
      </span>
    </label>
  );

  const submit = async () => {
    setState('saving');
    const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
    const next = readTargets({
      kcal: num(draft.kcal), proteinG: num(draft.proteinG), carbsG: num(draft.carbsG), fatG: num(draft.fatG),
      weightKg: num(draft.weightKg), weightBy: draft.weightBy || null,
    });
    try {
      await save(next);
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  return (
    <Card>
      <CardHead title={t('targets.title')} hint={t('targets.hint')} />
      <div className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {field('kcal', t('targets.kcal'), t('units.kcal'))}
          {field('proteinG', t('targets.protein'), t('units.grams'))}
          {field('carbsG', t('targets.carbs'), t('units.grams'))}
          {field('fatG', t('targets.fat'), t('units.grams'))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('weightKg', t('targets.weight'), t('units.kg'))}
          {field('weightBy', t('targets.weightBy'), '', 'date')}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={state === 'saving'}
            onClick={() => void submit()}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-caption font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          >
            {t('targets.save')}
          </button>
          {state === 'saved' && <span className="text-caption text-emerald-400">{t('targets.saved')}</span>}
          {state === 'failed' && <span className="text-caption text-rose-400">{t('targets.failed')}</span>}
        </div>
      </div>
    </Card>
  );
}

const toDraft = (t: Targets): Record<keyof Targets, string> => ({
  kcal: t.kcal?.toString() ?? '',
  proteinG: t.proteinG?.toString() ?? '',
  carbsG: t.carbsG?.toString() ?? '',
  fatG: t.fatG?.toString() ?? '',
  weightKg: t.weightKg?.toString() ?? '',
  weightBy: t.weightBy ?? '',
});
