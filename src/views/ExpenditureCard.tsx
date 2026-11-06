import React, { useState } from 'react';
import { t } from '../i18n';
import { formatInteger } from '../i18n/format';
import { addDays, type CivilDate } from '../lib/date';
import { useTargets } from '../hooks/useTargets';
import { estimateExpenditure, planFor, PACES, type CaloriePlan } from '../pipeline/expenditure';
import { weightPace, KEEP_MUSCLE_LOSS_PCT } from '../pipeline/targets';
import type { DailyRecord } from '../types/health';
import { Card, CardHead, Row, fmtNum } from '../ui/primitives';

/**
 * Nutrition page: what the person really burns, from their own logging and weigh-ins, and the
 * calories for a few weekly paces of loss, any of which can become the target in one tap.
 */
export function ExpenditureCard({ days, today }: { days: DailyRecord[]; today: CivilDate }) {
  const { targets, save } = useTargets();
  const [used, setUsed] = useState<number | null>(null);
  const exp = estimateExpenditure(days, today);
  const latestKg = [...days].reverse().find((d) => d.weightKg !== null)?.weightKg ?? null;
  const logged = days.filter((d) => d.date < today && d.date >= addDays(today, -28) && (d.caloriesKcal ?? 0) > 0).length;

  if (!exp || latestKg === null) {
    return (
      <Card>
        <CardHead title={t('nutrition.burn.title')} hint={t('nutrition.burn.hint')} />
        <p className="px-5 pb-5 text-caption text-zinc-500">{t('nutrition.burn.notYet', { logged })}</p>
      </Card>
    );
  }

  const pace = weightPace(latestKg, targets, today);
  const goalPct = pace && pace.neededPctPerWeek > 0 ? Math.min(pace.neededPctPerWeek, KEEP_MUSCLE_LOSS_PCT.max) : null;
  const plans: { plan: CaloriePlan; goal: boolean }[] = PACES.map((p) => ({ plan: planFor(exp, latestKg, p, targets), goal: false }));
  if (goalPct !== null && !PACES.some((p) => Math.abs(p - goalPct) < 0.05)) {
    plans.push({ plan: planFor(exp, latestKg, goalPct, targets), goal: true });
    plans.sort((a, b) => a.plan.pctPerWeek - b.plan.pctPerWeek);
  }

  const use = async (p: CaloriePlan) => {
    await save({ ...targets, kcal: p.kcal, carbsG: p.carbsG ?? targets.carbsG, fatG: p.fatG ?? targets.fatG });
    setUsed(p.kcal);
  };

  return (
    <Card>
      <CardHead title={t('nutrition.burn.title')} hint={t('nutrition.burn.hint')} />
      <div className="px-5 pb-5">
        <p className="text-section text-zinc-100 tabular-nums">{t('nutrition.burn.value', { kcal: formatInteger(exp.kcal) })}</p>
        <p className="text-caption text-zinc-500 mt-1 leading-relaxed">
          {t('nutrition.burn.from', {
            days: exp.loggedDays,
            eaten: formatInteger(exp.intakeKcal),
            weighIns: exp.weighIns,
            kg: `${exp.kgPerWeek > 0 ? '+' : ''}${fmtNum(exp.kgPerWeek, 2)}`,
            confidence: exp.confidence,
          })}
        </p>
        <div className="mt-3">
          {plans.map(({ plan, goal }) => (
            <Row key={plan.pctPerWeek} label={t('nutrition.burn.pace', { pct: fmtNum(plan.pctPerWeek, 2), kg: fmtNum(plan.kgPerWeek, 2), goal: goal ? 'yes' : 'no' })}>
              <span className="tabular-nums">
                {t('nutrition.burn.plan', {
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
                {t('nutrition.burn.use', { current: targets.kcal === plan.kcal ? 'yes' : 'no' })}
              </button>
            </Row>
          ))}
        </div>
        <p className="text-note text-zinc-500 mt-2 leading-relaxed">{t('nutrition.burn.note')}</p>
        {used !== null && <p className="text-caption text-emerald-300 mt-1">{t('nutrition.burn.saved', { kcal: formatInteger(used) })}</p>}
      </div>
    </Card>
  );
}
