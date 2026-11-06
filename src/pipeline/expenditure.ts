import { addDays, daysBetween, type CivilDate } from '../lib/date';
import type { Targets } from './targets';
import type { DailyRecord } from '../types/health';

/**
 * What the person really burns, worked out the way MacroFactor does: from what they logged eating
 * and what their weight actually did. If the trend says 0.5 kg a week came off while they ate
 * 3,000 kcal a day, they burned about 3,000 + 0.5 × 7,700 / 7 ≈ 3,550. No activity tracker or
 * formula guesses it; it's their own numbers, and it updates as they come in.
 *
 * - The last 28 days to yesterday (today is still being logged).
 * - Only days with food logged, and not days far under the usual (under half the median: most
 *   likely a day only partly logged, which would make the burn look lower than it is).
 * - The weight trend is a robust slope (Theil–Sen) through every weigh-in, so a single heavy or
 *   light morning barely moves it.
 * - 7,700 kcal a kilogram is the usual rough figure for body mass lost while dieting.
 *
 * It's only as right as the logging: what isn't logged reads as burned less. It firms up after
 * 3–4 weeks of steady logging and weighing.
 */

export const KCAL_PER_KG = 7700;

/**
 * The weight trend, kg a week: the median of the slopes between every pair of weigh-ins
 * (Theil–Sen), over at least 21 days. Kept here rather than taken from derive.ts so the server can
 * use it without the app's language layer.
 */
function trendOf(days: DailyRecord[]): { kgPerWeek: number; readings: number } | null {
  const pts = days.filter((d) => d.weightKg !== null).map((d) => ({ x: daysBetween(days[0].date, d.date), y: d.weightKg as number }));
  if (pts.length < 3 || pts[pts.length - 1].x - pts[0].x < 21) return null;
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j].x !== pts[i].x) slopes.push((pts[j].y - pts[i].y) / (pts[j].x - pts[i].x));
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const m = slopes.length / 2;
  const median = slopes.length % 2 ? slopes[Math.floor(m)] : (slopes[m - 1] + slopes[m]) / 2;
  return { kgPerWeek: median * 7, readings: pts.length };
}
const WINDOW = 28;

export interface Expenditure {
  kcal: number;
  intakeKcal: number;
  kgPerWeek: number;
  loggedDays: number;
  weighIns: number;
  confidence: 'low' | 'good';
}

export function estimateExpenditure(days: DailyRecord[], today: CivilDate): Expenditure | null {
  const from = addDays(today, -WINDOW);
  const to = addDays(today, -1);
  const window = days.filter((d) => d.date >= from && d.date <= to);
  const logged = window.map((d) => d.caloriesKcal).filter((k): k is number => typeof k === 'number' && k > 0);
  if (logged.length < 14) return null;
  const sorted = [...logged].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const full = logged.filter((k) => k >= median * 0.5);
  if (full.length < 14) return null;
  const trend = trendOf(window);
  if (!trend) return null;
  const intakeKcal = full.reduce((a, b) => a + b, 0) / full.length;
  const kcal = intakeKcal - (trend.kgPerWeek * KCAL_PER_KG) / 7;
  return {
    kcal: Math.round(kcal / 10) * 10,
    intakeKcal: Math.round(intakeKcal),
    kgPerWeek: trend.kgPerWeek,
    loggedDays: full.length,
    weighIns: trend.readings,
    confidence: full.length >= 21 && trend.readings >= 8 ? 'good' : 'low',
  };
}

export interface CaloriePlan {
  /** The loss a week this plan aims for, kg. */
  kgPerWeek: number;
  pctPerWeek: number;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/**
 * Calories for a weekly loss: the burn less the deficit that loss takes. Protein stays where the
 * person set it; fat stays too, down to 0.6 g per kg of target weight (or current) at the least;
 * carbohydrate takes the rest, at least 100 g.
 */
export function planFor(exp: Expenditure, currentKg: number, pctPerWeek: number, targets: Targets): CaloriePlan {
  const kgPerWeek = (currentKg * pctPerWeek) / 100;
  const kcal = Math.round((exp.kcal - (kgPerWeek * KCAL_PER_KG) / 7) / 10) * 10;
  const protein = targets.proteinG;
  let fat = targets.fatG;
  let carbs: number | null = null;
  if (protein !== null && fat !== null) {
    const minFat = Math.round(0.6 * (targets.weightKg ?? currentKg));
    carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carbs < 100) {
      const short = (100 - carbs) * 4;
      fat = Math.max(minFat, Math.round(fat - short / 9));
      carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    }
  }
  return { kgPerWeek, pctPerWeek, kcal, proteinG: protein, carbsG: carbs, fatG: fat };
}

/** The paces worth offering: the advised band for keeping muscle (Helms et al. 2014), and the goal's own. */
export const PACES = [0.5, 0.75, 1] as const;
