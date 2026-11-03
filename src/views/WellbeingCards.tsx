import React from 'react';
import { Dumbbell, Scale, Utensils } from 'lucide-react';
import { t, type MessageKey } from '../i18n';
import { formatCivilLong, formatInteger } from '../i18n/format';
import { addDays, daysBetween, type CivilDate } from '../lib/date';
import { series, weightTrend } from '../pipeline/derive';
import { suggest, type Food } from '../pipeline/foods';
import { LANDMARKS, setsPerMuscle, type Muscle, type MuscleWeek } from '../pipeline/muscles';
import { recentLoad, sessionSets, sessionVolume, type StrengthSession } from '../pipeline/strength';
import { KEEP_MUSCLE_LOSS_PCT, weightPace, type Targets } from '../pipeline/targets';
import type { DailyRecord } from '../types/health';
import { Card, DOMAIN, Meter, Row, Value, fmtNum } from '../ui/primitives';
import { MACRO } from './NutritionView';

/**
 * The cards Today shows for food, training and bodyweight, beside sleep, heart and steps. Each one
 * is arithmetic on the person's own logs and targets; where it leans on research, the source is
 * named in a comment beside the figure and in the card's words.
 */

export const MUSCLE_NAME = {
  chest: 'training.muscles.chest',
  back: 'training.muscles.back',
  shoulders: 'training.muscles.shoulders',
  quads: 'training.muscles.quads',
  hamstrings: 'training.muscles.hamstrings',
  biceps: 'training.muscles.biceps',
  triceps: 'training.muscles.triceps',
} as const satisfies Record<Muscle, MessageKey>;

const FOOD_NAME = {
  quark: 'nutrition.foods.quark',
  skyr: 'nutrition.foods.skyr',
  cottageCheese: 'nutrition.foods.cottageCheese',
  chicken: 'nutrition.foods.chicken',
  tuna: 'nutrition.foods.tuna',
  eggs: 'nutrition.foods.eggs',
  wheyShake: 'nutrition.foods.wheyShake',
  salmon: 'nutrition.foods.salmon',
  mince: 'nutrition.foods.mince',
  oats: 'nutrition.foods.oats',
  rice: 'nutrition.foods.rice',
  potatoes: 'nutrition.foods.potatoes',
  pasta: 'nutrition.foods.pasta',
  bread: 'nutrition.foods.bread',
  banana: 'nutrition.foods.banana',
  peanutButter: 'nutrition.foods.peanutButter',
  nuts: 'nutrition.foods.nuts',
  oliveOil: 'nutrition.foods.oliveOil',
} as const satisfies Record<string, MessageKey>;

const Head = ({ title, icon }: { title: string; icon: React.ReactNode }) => (
  <div className="flex items-start justify-between">
    <span className="card-title-glance text-zinc-500">{title}</span>
    {icon}
  </div>
);

/** One macro: eaten against its target, as a bar and in grams. */
function MacroBar({ label, eaten, target, color, unit }: { label: string; eaten: number | undefined; target: number | null; color: string; unit: string }) {
  const pct = target ? (100 * (eaten ?? 0)) / target : null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-caption">
        <span className="text-zinc-500">{label}</span>
        <span className="tabular-nums text-zinc-300">
          {fmtNum(eaten ?? 0, 0)}
          {target !== null && <span className="text-zinc-500"> / {fmtNum(target, 0)} {unit}</span>}
        </span>
      </div>
      {pct !== null && <Meter pct={Math.min(100, pct)} color={color} className="mt-1" />}
    </div>
  );
}

/** What's left of today's targets, in plain words. */
export function remainingOf(day: DailyRecord | undefined, targets: Targets) {
  const left = (target: number | null, eaten: number | undefined) => (target === null ? null : target - (eaten ?? 0));
  return {
    kcal: left(targets.kcal, day?.caloriesKcal),
    proteinG: left(targets.proteinG, day?.proteinG),
    carbsG: left(targets.carbsG, day?.carbsG),
    fatG: left(targets.fatG, day?.fatG),
  };
}

export function FoodLine({ food, focus }: { food: Food; focus: 'protein' | 'carbs' | 'fat' }) {
  const amount = focus === 'protein' ? food.proteinG : focus === 'carbs' ? food.carbsG : food.fatG;
  return (
    <Row dense label={t(FOOD_NAME[food.id as keyof typeof FOOD_NAME], { grams: food.portion })}>
      {t('nutrition.rest.foodValue', { amount: fmtNum(amount, 0), focus, kcal: fmtNum(food.kcal, 0) })}
    </Row>
  );
}

export function FoodToday({ day, targets, today }: { day: DailyRecord | undefined; targets: Targets; today: CivilDate }) {
  const logged = day?.caloriesKcal !== undefined;
  const hasTargets = targets.kcal !== null || targets.proteinG !== null;
  const left = remainingOf(day, targets);
  const idea = hasTargets ? suggest(left, 2) : null;
  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-4 pb-4 flex-1 flex flex-col gap-3">
        <Head title={t('today.food.title')} icon={<Utensils size={14} className={DOMAIN.wellbeing.text} />} />
        <div className="flex items-baseline gap-2">
          <Value value={logged ? day!.caloriesKcal! : null} unit={t('units.kcal')} size="md" />
          {targets.kcal !== null && (
            <span className="text-caption text-zinc-500">
              {left.kcal! >= 0
                ? t('today.food.left', { kcal: fmtNum(left.kcal, 0) })
                : t('today.food.over', { kcal: fmtNum(-left.kcal!, 0) })}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <MacroBar label={t('nutrition.macros.protein')} eaten={day?.proteinG} target={targets.proteinG} color={MACRO.protein} unit={t('units.grams')} />
          <MacroBar label={t('nutrition.macros.carbs')} eaten={day?.carbsG} target={targets.carbsG} color={MACRO.carbs} unit={t('units.grams')} />
          <MacroBar label={t('nutrition.macros.fat')} eaten={day?.fatG} target={targets.fatG} color={MACRO.fat} unit={t('units.grams')} />
        </div>
        {!hasTargets && <p className="text-caption text-zinc-500">{t('today.food.noTargets')}</p>}
        {!logged && <p className="text-caption text-zinc-500">{t('today.food.nothing', { date: formatCivilLong(today) })}</p>}
        {idea && (
          <div>
            <p className="text-caption text-zinc-400 mb-1">{t('nutrition.rest.ideas', { focus: idea.focus, grams: fmtNum(idea.focus === 'protein' ? left.proteinG : idea.focus === 'carbs' ? left.carbsG : left.fatG, 0) })}</p>
            {idea.foods.map((f) => <FoodLine key={f.id} food={f} focus={idea.focus} />)}
          </div>
        )}
      </div>
    </Card>
  );
}

/** The muscles to name: those past their MRV, then those near it, then any well below MEV. */
function standouts(week: MuscleWeek[]) {
  const name = (m: Muscle) => t(MUSCLE_NAME[m]);
  return {
    over: week.filter((w) => w.zone === 'over').map((w) => name(w.muscle)),
    high: week.filter((w) => w.zone === 'high').map((w) => name(w.muscle)),
  };
}

/**
 * How the last week's training is likely to feel, from its volume. Sets per muscle against the
 * MEV–MRV landmarks (Israetel / Renaissance Periodization), the week against the four before it,
 * and the person's own ratings in StrengthLog when they gave any. It describes load, not the body:
 * how someone actually recovers depends on sleep, food, stress and more than any count shows.
 */
export function TrainingRecovery({ sessions, today, sleepZ }: { sessions: StrengthSession[]; today: CivilDate; sleepZ?: number | null }) {
  if (!sessions.length) {
    return (
      <Card className="flex flex-col">
        <div className="px-4 pt-4 pb-4 flex flex-col gap-2">
          <Head title={t('today.training.title')} icon={<Dumbbell size={14} className="text-orange-400" />} />
          <p className="text-caption text-zinc-500">{t('today.training.none')}</p>
        </div>
      </Card>
    );
  }
  const last = sessions[sessions.length - 1];
  const ago = daysBetween(last.date, today);
  const load = recentLoad(sessions, today);
  const { week } = setsPerMuscle(sessions, today);
  const { over, high } = standouts(week);
  const recentRatings = sessions.filter((s) => s.date >= addDays(today, -6) && s.ratings).at(-1)?.ratings;
  const verdict =
    over.length ? 'over' : load.ratio !== null && load.ratio >= 1.3 ? 'ramp' : high.length ? 'high' : load.week.sessions === 0 ? 'rest' : 'steady';
  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-4 pb-4 flex-1 flex flex-col gap-3">
        <Head title={t('today.training.title')} icon={<Dumbbell size={14} className="text-orange-400" />} />
        <div>
          <Value value={formatInteger(load.week.sets)} unit={t('today.training.setsWeek')} size="md" />
          {load.usual && (
            <p className="text-caption text-zinc-500 mt-0.5">{t('today.training.vsUsual', { usual: fmtNum(load.usual.sets, 0) })}</p>
          )}
        </div>
        <div>
          <Row dense label={t('today.training.last')}>
            {t('today.training.lastValue', { ago, volume: fmtNum(sessionVolume(last) / 1000, 1), sets: formatInteger(sessionSets(last)) })}
          </Row>
          {recentRatings?.sleep !== undefined && <Row dense label={t('today.training.ratedSleep')}>{`${recentRatings.sleep}/10`}</Row>}
          {recentRatings?.form !== undefined && <Row dense label={t('today.training.ratedForm')}>{`${recentRatings.form}/10`}</Row>}
        </div>
        <p className="text-caption text-zinc-300 leading-relaxed">
          {t('today.training.verdict', {
            verdict,
            over: over.join(', '),
            high: high.join(', '),
            percent: formatInteger(Math.round(((load.ratio ?? 1) - 1) * 100)),
          })}
          {sleepZ !== null && sleepZ !== undefined && sleepZ <= -1.5 && ` ${t('today.training.shortSleep')}`}
        </p>
      </div>
    </Card>
  );
}

/** The target weight, and the pace it asks of each week against the pace the scale shows. */
export function WeightGoal({ days, targets, today }: { days: DailyRecord[]; targets: Targets; today: CivilDate }) {
  const weights = series(days, (d) => d.weightKg);
  const latest = [...weights].reverse().find((p) => p.value !== null);
  const trend = weightTrend(weights.slice(-35));
  const pace = weightPace(latest?.value ?? null, targets, today);
  const trendPct = trend && latest?.value ? (-100 * trend.kgPerWeek) / latest.value : null;
  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-4 pb-4 flex-1 flex flex-col gap-3">
        <Head title={t('today.weight.title')} icon={<Scale size={14} className={DOMAIN.body.text} />} />
        <div className="flex items-baseline gap-2">
          <Value value={latest?.value ?? null} digits={1} unit={t('units.kg')} size="md" />
          {targets.weightKg !== null && <span className="text-caption text-zinc-500">{t('today.weight.target', { kg: fmtNum(targets.weightKg, 1) })}</span>}
        </div>
        {pace ? (
          <div>
            <Row dense label={t('today.weight.toGo')}>{t('today.weight.toGoValue', { kg: fmtNum(pace.toGo, 1), weeks: formatInteger(Math.round(pace.weeksLeft)) })}</Row>
            <Row dense label={t('today.weight.needed')}>{t('today.weight.pace', { kg: fmtNum(pace.neededKgPerWeek, 2), pct: fmtNum(pace.neededPctPerWeek, 2) })}</Row>
            <Row dense label={t('today.weight.trend')}>
              {trend && trendPct !== null ? t('today.weight.pace', { kg: fmtNum(-trend.kgPerWeek, 2), pct: fmtNum(trendPct, 2) }) : t('today.weight.trendNone')}
            </Row>
          </div>
        ) : (
          <p className="text-caption text-zinc-500">{t('today.weight.noTarget')}</p>
        )}
        {pace && (
          <p className="text-caption text-zinc-400 leading-relaxed">
            {t('today.weight.verdict', {
              band: pace.neededPctPerWeek > KEEP_MUSCLE_LOSS_PCT.max ? 'fast' : pace.neededPctPerWeek < KEEP_MUSCLE_LOSS_PCT.min ? 'gentle' : 'inside',
              min: fmtNum(KEEP_MUSCLE_LOSS_PCT.min, 1),
              max: fmtNum(KEEP_MUSCLE_LOSS_PCT.max, 1),
            })}
          </p>
        )}
      </div>
    </Card>
  );
}

/** For the Training page: each muscle's week against its landmarks. */
export function MuscleWeekRows({ week }: { week: MuscleWeek[] }) {
  const colour = { below: 'var(--color-zinc-600)', productive: 'var(--emerald-400)', high: 'var(--amber-400)', over: 'var(--rose-400)' } as const;
  return (
    <div className="space-y-2.5">
      {week.map((w) => {
        const l = LANDMARKS[w.muscle];
        return (
          <div key={w.muscle}>
            <div className="flex items-baseline justify-between text-caption">
              <span className="text-zinc-300">{t(MUSCLE_NAME[w.muscle])}</span>
              <span className="tabular-nums text-zinc-400">
                {t('training.muscleWeek.value', { sets: fmtNum(w.sets, 1), zone: w.zone, mev: l.mev, mavTop: l.mav[1], mrv: l.mrv })}
              </span>
            </div>
            <Meter pct={Math.min(100, (100 * w.sets) / (l.mrv * 1.2))} color={colour[w.zone]} className="mt-1" />
          </div>
        );
      })}
    </div>
  );
}
