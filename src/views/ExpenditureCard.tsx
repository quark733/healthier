import React, { useState } from 'react';
import { t } from '../i18n';
import { formatInteger } from '../i18n/format';
import type { CivilDate } from '../lib/date';
import { useTargets } from '../hooks/useTargets';
import { planFor, PACES, type CaloriePlan } from '../pipeline/expenditure';
import type { Maintenance } from '../pipeline/eating';
import { weightPace, KEEP_MUSCLE_LOSS_PCT } from '../pipeline/targets';
import type { DailyRecord } from '../types/health';
import { Card, CardHead, Row, fmtNum } from '../ui/primitives';

/**
 * Nutrition page: the calories for a few weekly paces of loss, worked out from the maintenance the
 * page shows (pipeline/eating.ts), any of which can become the target in one tap. The pace the
 * weight goal needs is among them when it's within what keeps muscle.
 */
export function ExpenditureCard({ days, today, maintenance }: { days: DailyRecord[]; today: CivilDate; maintenance: Maintenance | null }) {
  const { targets, save } = useTargets();
  const [used, setUsed] = useState<number | null>(null);
  const latestKg = [...days].reverse().find((d) => d.weightKg !== null)?.weightKg ?? null;

  if (!maintenance || latestKg === null) {
    return (
      <Card>
        <CardHead title={t('food.burn.title')} hint={t('food.burn.hint')} />
        <p className="px-5 pb-5 text-caption text-zinc-500">{t('food.burn.notYet')}</p>
      </Card>
    );
  }

  const pace = weightPace(latestKg, targets, today);
  const goalPct = pace && pace.neededPctPerWeek > 0 ? Math.min(pace.neededPctPerWeek, KEEP_MUSCLE_LOSS_PCT.max) : null;
  const plans: { plan: CaloriePlan; goal: boolean }[] = PACES.map((p) => ({ plan: planFor(maintenance, latestKg, p, targets), goal: false }));
  if (goalPct !== null && !PACES.some((p) => Math.abs(p - goalPct) < 0.05)) {
    plans.push({ plan: planFor(maintenance, latestKg, goalPct, targets), goal: true });
    plans.sort((a, b) => a.plan.pctPerWeek - b.plan.pctPerWeek);
  }

  const use = async (p: CaloriePlan) => {
    await save({ ...targets, kcal: p.kcal, carbsG: p.carbsG ?? targets.carbsG, fatG: p.fatG ?? targets.fatG });
    setUsed(p.kcal);
  };

  return (
    <Card>
      <CardHead title={t('food.burn.title')} hint={t('food.burn.hint')} />
      <div className="px-5 pb-5">
        <p className="text-caption text-zinc-400 leading-relaxed">{t('food.burn.from', { kcal: formatInteger(maintenance.kcal) })}</p>
        <div className="mt-3">
          {plans.map(({ plan, goal }) => (
            <Row key={plan.pctPerWeek} label={t('food.burn.pace', { pct: fmtNum(plan.pctPerWeek, 2), kg: fmtNum(plan.kgPerWeek, 2), goal: goal ? 'yes' : 'no' })}>
              <span className="tabular-nums">
                {t('food.burn.plan', {
                  kcal: formatInteger(plan.kcal),
                  macros: plan.proteinG !== null && plan.carbsG !== null && plan.fatG !== null ? 'yes' : 'no',
                  p: plan.proteinG ?? 0,
                  c: plan.carbsG ?? 0,
                  f: plan.fatG ?? 0,
                })}
              </span>
              <button
                type="button"
                onClick={() => use(plan)}
                className={`ml-3 text-caption underline underline-offset-2 ${targets.kcal === plan.kcal ? 'text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t('food.burn.use', { current: targets.kcal === plan.kcal ? 'yes' : 'no' })}
              </button>
            </Row>
          ))}
        </div>
        <p className="text-note text-zinc-500 mt-2 leading-relaxed">{t('food.burn.note')}</p>
        {used !== null && <p className="text-caption text-emerald-300 mt-1">{t('food.burn.saved', { kcal: formatInteger(used) })}</p>}
      </div>
    </Card>
  );
}
