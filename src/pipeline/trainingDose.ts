import { addDays, type CivilDate } from '../lib/date';
import { series, sleepDebt, sleepNeedFor, weightTrend, type Readiness } from './derive';
import { LANDMARKS, MUSCLES, musclesOf, setsPerMuscle, type Muscle } from './muscles';
import { bestOf, recentLoad, type StrengthSession } from './strength';
import type { DailyRecord } from '../types/health';
import type { CheckinVerdict } from './checkin';

/**
 * Today's training dose for someone lifting to keep muscle and strength: how close to failure to
 * take the work sets, how many of them, and which muscles are ready. Rules, not a model, and each
 * rule is one the research supports; where the research is thin the rule says so and weighs less.
 *
 * The starting point (a normal day):
 *   Work sets 1–3 reps in reserve (RPE 7–9). Across 55 studies, growth rose the closer sets ended
 *   to failure while strength didn't depend on it (Robinson et al. 2024, Sports Med); training to
 *   failure itself added little and took 24–48 h longer to recover from (Refalo et al. 2023;
 *   Morán-Navarro et al. 2017). So heavy compound lifts sit at 2–3 in reserve and isolation work
 *   can go to 0–1.
 *
 * What moves it, one step each, to at most "light":
 *   - Last night's sleep short (< 6 h, or 1.5 h under the person's need). Acute sleep loss lowered
 *     strength and, more so, strength endurance across 77 studies, and the later in the day the
 *     larger the loss (Craven et al. 2022, Sports Med). Keep the loads, drop sets, stop further
 *     from failure.
 *   - The body battery drained (< 30) with enough data behind it. HRV and resting heart rate as a
 *     guide for strength training is promising but not settled (narrative review, J Funct Morphol
 *     Kinesiol 2024), so this is one step, never more.
 *   - This morning's check-in low (pipeline/checkin.ts), or without one, the person's own ratings in
 *     StrengthLog low at the last session within 3 days; one step for the two together. Self-reported
 *     wellbeing tracks training load better than most objective markers (Saw et al. 2016, BJSM:
 *     56 studies).
 *   - This week's sets ≥ 30% over the usual week. A rule of thumb for when fatigue shows, not a
 *     research threshold: the acute:chronic ratio behind such limits is disputed.
 * Signs of illness (breathing rate or skin temperature up, from the battery) mean rest.
 *
 * Notes that don't change today's dose but matter for the goal:
 *   - An energy deficit of about 500 kcal a day or more blocked gains in lean mass but not in
 *     strength (Murphy & Koehler 2022, Scand J Med Sci Sports): keep the loads heavy and the volume
 *     moderate, the aim is to keep, not to add.
 *   - Losing more than 1% of bodyweight a week costs more muscle (Helms et al. 2014).
 *   - Short sleep while dieting shifts the loss from fat to muscle: 5.5 h instead of 8.5 h a night
 *     halved fat loss and raised fat-free mass loss by 60% (Nedeltcheva et al. 2010, Ann Intern Med).
 *   - Main lifts falling for several sessions suggest a lighter week. Coaches agree a deload means
 *     reduced training stress (Bell et al. 2023, Delphi consensus); a full week off cost some
 *     strength against training on (Coleman et al. 2024, PeerJ), so lighter, not off.
 */

export type DoseLevel = 'full' | 'reduced' | 'light' | 'rest';
export type DoseReason = 'shortSleep' | 'battery' | 'checkinLow' | 'ratedLow' | 'ramp' | 'illness' | 'calf';
export type DoseNote = 'deficit' | 'fastLoss' | 'sleepWhileDieting' | 'stall';

export interface Dose {
  level: DoseLevel;
  /** Reps in reserve for work sets: compounds sit at the upper end, isolation work at the lower. */
  rir: [number, number] | null;
  /** The same as RPE (10 − RIR). */
  rpe: [number, number] | null;
  /** The share of the usual sets: 1, about two thirds, or a half. */
  setsShare: number;
  reasons: DoseReason[];
  notes: DoseNote[];
  /** Trained in the last day (less than ~48 h ago by the time of an afternoon session) or not. */
  recovering: Muscle[];
  ready: Muscle[];
  /** Under the minimum effective volume this week, so with room for sets. */
  room: Muscle[];
  /** Near or past the maximum recoverable volume this week, so better left. */
  full: Muscle[];
  trainedToday: boolean;
  facts: {
    sleepMin: number | null;
    needMin: number;
    sleepMean7Min: number | null;
    battery: number | null;
    weekRatio: number | null;
    lossPctPerWeek: number | null;
    deficitKcal: number | null;
    ratedOn: CivilDate | null;
  };
}

const LEVELS: DoseLevel[] = ['full', 'reduced', 'light'];
const RIR: Record<Exclude<DoseLevel, 'rest'>, [number, number]> = { full: [1, 3], reduced: [2, 4], light: [3, 5] };
const SETS: Record<DoseLevel, number> = { full: 1, reduced: 0.67, light: 0.5, rest: 0 };
/** One kilogram of bodyweight lost, mostly fat, as energy: the usual rough figure. */
const KCAL_PER_KG = 7700;

export interface DoseInput {
  days: DailyRecord[];
  sessions: StrengthSession[];
  today: CivilDate;
  readiness: Readiness | null;
  sleepNeedSet?: number | null;
  /** This morning's check-in, judged against the person's usual (pipeline/checkin.ts). */
  checkin?: CheckinVerdict | null;
  /** A calf that hurts on one side, for someone with a clot history: no hard training until it's checked. */
  calfAlert?: boolean;
}

export function trainingDose({ days, sessions, today, readiness, sleepNeedSet, checkin, calfAlert }: DoseInput): Dose {
  const reasons: DoseReason[] = [];
  const notes: DoseNote[] = [];

  // Last night: the main sleep that ended this morning.
  const needMin = sleepNeedFor(days, sleepNeedSet);
  const night = days.find((d) => d.date === today)?.sleep ?? null;
  const sleepMin = night ? night.minutesAsleep : null;
  if (sleepMin !== null && (sleepMin < 360 || needMin - sleepMin >= 90)) reasons.push('shortSleep');

  // The battery, only when it rests on enough data.
  const battery = readiness?.score ?? null;
  // Illness: breathing rate and skin temperature both up, or one of them well up.
  const sick = (readiness?.parts ?? []).filter((p) => (p.id === 'breathing' || p.id === 'skinTemp') && p.contribution < 0);
  const illness = sick.length === 2 || sick.some((p) => p.contribution <= -6);
  if (battery !== null && battery < 30 && readiness!.confidence !== 'low') reasons.push('battery');

  // The person's own ratings at the last session in the 3 days before today.
  const rated = [...sessions]
    .filter((s) => s.ratings && s.date >= addDays(today, -3) && s.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const r = rated?.ratings;
  // This morning's check-in is the fresher of the two self-reports; together they count as one step.
  if (checkin?.lower) reasons.push('checkinLow');
  else if (!checkin && r && ((r.sleep ?? 10) <= 3 || (r.stress ?? 10) <= 3 || (r.form ?? 10) <= 3)) reasons.push('ratedLow');

  // This week against the usual.
  const load = recentLoad(sessions, today);
  if (load.ratio !== null && load.usual && load.usual.sets >= 5 && load.ratio >= 1.3) reasons.push('ramp');

  let level: DoseLevel = LEVELS[Math.min(reasons.length, LEVELS.length - 1)];
  if (illness) {
    reasons.unshift('illness');
    level = 'rest';
  }
  if (calfAlert) {
    reasons.unshift('calf');
    level = 'rest';
  }

  // Bodyweight: the trend of the last 5 weeks, and what it says about the deficit.
  const weights = series(days, (d) => d.weightKg).slice(-35);
  const trend = weightTrend(weights);
  const latestKg = [...weights].reverse().find((p) => p.value !== null)?.value ?? null;
  const lossPctPerWeek = trend && latestKg ? (-100 * trend.kgPerWeek) / latestKg : null;
  const deficitKcal = trend && trend.kgPerWeek < 0 ? (-trend.kgPerWeek * KCAL_PER_KG) / 7 : null;
  const dieting = deficitKcal !== null && deficitKcal >= 250;
  if (deficitKcal !== null && deficitKcal >= 500) notes.push('deficit');
  if (lossPctPerWeek !== null && lossPctPerWeek > 1) notes.push('fastLoss');

  // Sleep across the week while dieting.
  const week = days.filter((d) => d.sleep && d.date > addDays(today, -7) && d.date <= today).map((d) => d.sleep!.minutesAsleep);
  const sleepMean7Min = week.length >= 4 ? week.reduce((a, b) => a + b, 0) / week.length : null;
  const debt = sleepDebt(days, needMin);
  if (dieting && sleepMean7Min !== null && (sleepMean7Min < 420 || (debt && debt.netMin >= 300))) notes.push('sleepWhileDieting');

  if (stalling(sessions, today)) notes.push('stall');

  // Muscles: when each was last trained, and where its week stands.
  const lastTrained = new Map<Muscle, CivilDate>();
  for (const s of sessions) {
    if (s.date > today) continue;
    for (const e of s.exercises) {
      const work = musclesOf(e.name);
      if (!work || !e.sets.some((set) => set.reps > 0)) continue;
      for (const [m, share] of Object.entries(work) as [Muscle, number][]) {
        if (share < 1) continue;
        const prev = lastTrained.get(m);
        if (!prev || s.date > prev) lastTrained.set(m, s.date);
      }
    }
  }
  const yesterday = addDays(today, -1);
  const recovering = MUSCLES.filter((m) => (lastTrained.get(m) ?? '') >= yesterday);
  const ready = MUSCLES.filter((m) => !recovering.includes(m));
  const weekSets = setsPerMuscle(sessions, today).week;
  const room = weekSets.filter((w) => w.zone === 'below').map((w) => w.muscle);
  const full = weekSets.filter((w) => w.zone === 'over' || (w.zone === 'high' && w.sets >= LANDMARKS[w.muscle].mrv - 1)).map((w) => w.muscle);

  const rir = level === 'rest' ? null : RIR[level];
  return {
    level,
    rir,
    rpe: rir ? [10 - rir[1], 10 - rir[0]] : null,
    setsShare: SETS[level],
    reasons,
    notes,
    recovering,
    ready,
    room,
    full,
    trainedToday: sessions.some((s) => s.date === today),
    facts: {
      sleepMin,
      needMin,
      sleepMean7Min,
      battery,
      weekRatio: load.ratio,
      lossPctPerWeek,
      deficitKcal,
      ratedOn: rated?.date ?? null,
    },
  };
}

/**
 * Whether two or more of the person's main lifts (the three done most in the last 6 weeks, each at
 * least 3 times) came in at their latest session more than 5% under their best of those weeks.
 * One off day is noise; several lifts down together is fatigue showing.
 */
export function stalling(sessions: StrengthSession[], today: CivilDate): boolean {
  const from = addDays(today, -42);
  const recent = sessions.filter((s) => s.date >= from && s.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byLift = new Map<string, number[]>();
  for (const s of recent) {
    for (const e of s.exercises) {
      const e1rm = bestOf(e).e1rm;
      if (e1rm === null) continue;
      const list = byLift.get(e.name) ?? [];
      list.push(e1rm);
      byLift.set(e.name, list);
    }
  }
  const main = [...byLift.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const down = main.filter(([, v]) => v[v.length - 1] < 0.95 * Math.max(...v.slice(0, -1))).length;
  return down >= 2;
}
