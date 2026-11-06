import { workoutWeek } from '../pipeline/workouts';
import React from 'react';
import { Dumbbell, Scale, Utensils } from 'lucide-react';
import { t, type MessageKey } from '../i18n';
import { formatCivilLong, formatHours, formatInteger, formatList } from '../i18n/format';
import type { Dose } from '../pipeline/trainingDose';
import { CHECKIN_ITEMS, caffeineEffect, judgeCheckin, type Checkin, type CheckinItem } from '../pipeline/checkin';
import { addDays, daysBetween, type CivilDate } from '../lib/date';
import { bodyComposition, series, weightTrend } from '../pipeline/derive';
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
export function TrainingRecovery({ sessions, today, sleepZ, days = [] }: { sessions: StrengthSession[]; today: CivilDate; sleepZ?: number | null; days?: DailyRecord[] }) {
  if (!sessions.length) {
    const week = workoutWeek(days, today);
    return (
      <Card className="flex flex-col">
        <div className="px-4 pt-4 pb-4 flex flex-col gap-2">
          <Head title={t('today.training.title')} icon={<Dumbbell size={14} className="text-orange-400" />} />
          <p className="text-caption text-zinc-500">
            {week.sessions
              ? t('today.training.workoutsOnly', { sessions: week.sessions, cardio: formatInteger(week.cardioMinutes) })
              : t('today.training.none')}
          </p>
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
  // Fat and lean from the scale's body-fat readings, over the last 8 weeks.
  const comp = bodyComposition(days.filter((d) => d.date > addDays(today, -56)));
  const lost = comp ? -(comp.fatKgPerWeek + comp.leanKgPerWeek) : 0;
  const leanShare = comp && lost > 0.05 && comp.leanKgPerWeek < 0 ? Math.round((100 * -comp.leanKgPerWeek) / lost) : null;
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
        {comp && (
          <div>
            <Row dense label={t('today.weight.fat')}>{t('today.weight.perWeek', { kg: fmtNum(comp.fatKgPerWeek, 2) })}</Row>
            <Row dense label={t('today.weight.lean')}>{t('today.weight.perWeek', { kg: fmtNum(comp.leanKgPerWeek, 2) })}</Row>
            <p className="text-note text-zinc-500 mt-1 leading-relaxed">
              {t('today.weight.composition', {
                weeks: formatInteger(Math.round(comp.spanDays / 7)),
                share: leanShare === null ? 'none' : formatInteger(leanShare),
              })}
            </p>
          </div>
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

const LEVEL_COLOUR = { full: 'text-emerald-400', reduced: 'text-amber-400', light: 'text-orange-400', rest: 'text-rose-400' } as const;

/**
 * Today's training dose: how hard, how much, and which muscles are ready, from last night's sleep,
 * the battery, the person's own ratings, this week's load and their bodyweight trend
 * (pipeline/trainingDose.ts, where each rule's source is named).
 */
export function TrainingDoseCard({ dose, hasSessions }: { dose: Dose; hasSessions: boolean }) {
  const muscles = (list: Muscle[]) => formatList(list.map((m) => t(MUSCLE_NAME[m]).toLocaleLowerCase()));
  const f = dose.facts;
  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-4 pb-4 flex-1 flex flex-col gap-3">
        <Head title={t('today.dose.title')} icon={<Dumbbell size={14} className="text-orange-400" />} />
        <div>
          <p className={`text-section font-semibold ${LEVEL_COLOUR[dose.level]}`}>{t('today.dose.level', { level: dose.level })}</p>
          {dose.rpe && dose.rir && (
            <p className="text-detail text-zinc-200 tabular-nums mt-0.5">
              {t('today.dose.effort', { rpeLow: dose.rpe[0], rpeHigh: dose.rpe[1], rirLow: dose.rir[0], rirHigh: dose.rir[1] })}
            </p>
          )}
          <p className="text-caption text-zinc-400 mt-1 leading-relaxed">{t('today.dose.what', { level: dose.level })}</p>
        </div>

        {dose.reasons.length > 0 && (
          <ul className="space-y-1 text-caption text-zinc-400 leading-relaxed">
            {dose.reasons.map((r) => (
              <li key={r}>
                {t('today.dose.reason', {
                  reason: r,
                  sleep: f.sleepMin === null ? '' : formatHours(f.sleepMin),
                  battery: f.battery === null ? '' : formatInteger(f.battery),
                  percent: f.weekRatio === null ? '' : formatInteger(Math.round((f.weekRatio - 1) * 100)),
                })}
              </li>
            ))}
          </ul>
        )}

        {hasSessions && (
          <div>
            {dose.trainedToday && <p className="text-caption text-zinc-300 mb-1">{t('today.dose.trainedToday')}</p>}
            {dose.ready.length > 0 && <Row dense label={t('today.dose.ready')}>{muscles(dose.ready)}</Row>}
            {dose.recovering.length > 0 && <Row dense label={t('today.dose.recovering')}>{muscles(dose.recovering)}</Row>}
            {dose.room.length > 0 && <Row dense label={t('today.dose.room')}>{muscles(dose.room)}</Row>}
            {dose.full.length > 0 && <Row dense label={t('today.dose.full')}>{muscles(dose.full)}</Row>}
          </div>
        )}

        {dose.notes.map((n) => (
          <p key={n} className="text-caption text-zinc-400 leading-relaxed">
            {t('today.dose.note', {
              note: n,
              kcal: f.deficitKcal === null ? '' : formatInteger(Math.round(f.deficitKcal / 50) * 50),
              pct: f.lossPctPerWeek === null ? '' : fmtNum(f.lossPctPerWeek, 1),
              sleep: f.sleepMean7Min === null ? '' : formatHours(f.sleepMean7Min),
            })}
          </p>
        ))}

        <div className="mt-auto">
          <p className="text-note text-zinc-500">{t('today.dose.footer')}</p>
          <details className="text-note text-zinc-500 mt-1">
            <summary className="cursor-pointer">{t('today.dose.sources')}</summary>
            <p className="mt-1 leading-relaxed">{t('today.dose.sourceList')}</p>
          </details>
        </div>
      </div>
    </Card>
  );
}

/**
 * This morning's check-in: five questions, 1 to 5, before the watch's numbers. Asked until it's
 * answered, then a summary against the person's usual with a way to change it.
 */
export function CheckinCard({ checkins, today, save, days = [] }: { checkins: Checkin[]; today: CivilDate; save: (c: Checkin) => Promise<void>; days?: DailyRecord[] }) {
  const done = checkins.find((c) => c.date === today) ?? null;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Partial<Record<CheckinItem, number>>>({});
  const [late, setLate] = React.useState<boolean | null>(null);
  const [saving, setSaving] = React.useState(false);
  const verdict = judgeCheckin(checkins, today);
  const complete = CHECKIN_ITEMS.every((k) => draft[k]) && late !== null;
  const caffeine = caffeineEffect(checkins, (date) => days.find((d) => d.date === date)?.sleep?.minutesAsleep ?? null, today);

  const start = () => {
    setDraft(done ? { ...done } : {});
    setLate(done?.lateCaffeine ?? null);
    setEditing(true);
  };
  const submit = async () => {
    if (!complete) return;
    setSaving(true);
    try {
      await save({ date: today, ...(draft as Record<CheckinItem, number>), lateCaffeine: late ?? undefined });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (done && !editing && verdict) {
    return (
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="card-title-glance text-zinc-500">{t('today.checkin.title')}</span>
          <span className="text-detail text-zinc-200 tabular-nums">
            {t('today.checkin.total', { total: verdict.total, usual: verdict.usual === null ? 'none' : fmtNum(verdict.usual, 0) })}
          </span>
          {verdict.low.length > 0 && (
            <span className="text-caption text-amber-400">
              {t('today.checkin.low', { items: formatList(verdict.low.map((k) => t(CHECKIN_NAME[k]).toLocaleLowerCase())) })}
            </span>
          )}
          <button type="button" onClick={start} className="ml-auto text-caption text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
            {t('today.checkin.change')}
          </button>
          {caffeine && (
            <p className="w-full text-note text-zinc-500">
              {t('today.checkin.caffeineEffect', {
                with: fmtNum(caffeine.ratingWith, 1),
                without: fmtNum(caffeine.ratingWithout, 1),
                withN: caffeine.withN,
                withoutN: caffeine.withoutN,
                minutes: caffeine.minutesWith === null || caffeine.minutesWithout === null ? 'none' : formatInteger(Math.abs(Math.round(caffeine.minutesWithout - caffeine.minutesWith))),
                direction: caffeine.minutesWith !== null && caffeine.minutesWithout !== null && caffeine.minutesWith > caffeine.minutesWithout ? 'more' : 'less',
              })}
            </p>
          )}
        </div>
      </Card>
    );
  }

  if (!editing && !done) {
    return (
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="card-title-glance text-zinc-500">{t('today.checkin.title')}</p>
            <p className="text-caption text-zinc-400 mt-0.5">{t('today.checkin.prompt')}</p>
          </div>
          <button type="button" onClick={start} className="ml-auto rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium">
            {t('today.checkin.start')}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-4 pt-4 pb-4">
        <p className="card-title-glance text-zinc-500">{t('today.checkin.title')}</p>
        <p className="text-caption text-zinc-400 mt-0.5">{t('today.checkin.scale')}</p>
        <div className="mt-3 space-y-2.5">
          {CHECKIN_ITEMS.map((k) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption text-zinc-300">{t(CHECKIN_NAME[k])}</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t(CHECKIN_NAME[k])}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={draft[k] === v}
                    title={t('today.checkin.anchor', { item: k, value: v })}
                    onClick={() => setDraft((d) => ({ ...d, [k]: v }))}
                    className={`w-9 h-9 rounded-lg text-caption tabular-nums border ${
                      draft[k] === v ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {draft[k] !== undefined && <p className="w-full text-note text-zinc-500 -mt-1">{t('today.checkin.anchor', { item: k, value: draft[k]! })}</p>}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-zinc-300">{t('today.checkin.lateCaffeine')}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('today.checkin.lateCaffeine')}>
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={late === v}
                  onClick={() => setLate(v)}
                  className={`px-3 h-9 rounded-lg text-caption border ${
                    late === v ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {t('today.checkin.yesNo', { value: v ? 'yes' : 'no' })}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!complete || saving}
            onClick={submit}
            className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium disabled:opacity-40"
          >
            {t('today.checkin.save')}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-caption text-zinc-400 hover:text-zinc-200">
            {t('today.checkin.cancel')}
          </button>
        </div>
      </div>
    </Card>
  );
}

export const CHECKIN_NAME = {
  sleep: 'today.checkin.items.sleep',
  fatigue: 'today.checkin.items.fatigue',
  soreness: 'today.checkin.items.soreness',
  stress: 'today.checkin.items.stress',
  mood: 'today.checkin.items.mood',
} as const satisfies Record<CheckinItem, MessageKey>;
