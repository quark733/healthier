import type { CivilDate } from '../lib/date';

/**
 * The person's own targets for food and bodyweight, typed in once on the Nutrition page: what
 * their food diary app aims for (MyFitnessPal doesn't share its goals through Apple Health, so
 * they can't be read) and the weight they're working towards. Kept apart from the activity and
 * sleep goals in goals.ts. Every one is optional: a card with nothing to measure against says so.
 */
export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  weightKg: number | null;
  /** The date the target weight is meant for. */
  weightBy: CivilDate | null;
}

export const EMPTY_TARGETS: Targets = { kcal: null, proteinG: null, carbsG: null, fatG: null, weightKg: null, weightBy: null };

/** What each target may be: wide enough for anyone, narrow enough that a typo can't pass. */
export const TARGET_LIMITS = {
  kcal: { min: 800, max: 8000 },
  proteinG: { min: 10, max: 500 },
  carbsG: { min: 0, max: 1000 },
  fatG: { min: 0, max: 400 },
  weightKg: { min: 30, max: 350 },
} as const;

type NumericKey = keyof typeof TARGET_LIMITS;
const KEYS: NumericKey[] = ['kcal', 'proteinG', 'carbsG', 'fatG', 'weightKg'];

const inRange = (v: unknown, key: NumericKey): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const { min, max } = TARGET_LIMITS[key];
  return v >= min && v <= max ? Math.round(v * 10) / 10 : null;
};
const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Targets as stored or sent: anything unreadable or out of bounds is left unset. */
export function readTargets(raw: unknown): Targets {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Targets = { ...EMPTY_TARGETS };
  for (const k of KEYS) out[k] = inRange(o[k], k);
  out.weightBy = isDate(o.weightBy) ? o.weightBy : null;
  return out;
}

export interface WeightPace {
  /** Kilograms still to go, positive when losing. */
  toGo: number;
  weeksLeft: number;
  /** The pace the target needs, kg a week (positive is a loss). */
  neededKgPerWeek: number;
  /** The same as a share of bodyweight a week, in percent. */
  neededPctPerWeek: number;
}

/**
 * What a target weight asks of each week from here. For losing fat while keeping muscle, a loss of
 * about 0.5 to 1% of bodyweight a week is the range most often recommended (Helms, Aragon &
 * Fitschen 2014); in trained athletes, the slower of two rates kept more lean mass (Garthe et al.
 * 2011: 0.7% beat 1.4% a week).
 */
export function weightPace(currentKg: number | null, targets: Targets, today: CivilDate): WeightPace | null {
  if (currentKg === null || targets.weightKg === null || !targets.weightBy) return null;
  const days = (Date.parse(targets.weightBy) - Date.parse(today)) / 86_400_000;
  if (days < 7) return null;
  const weeksLeft = days / 7;
  const toGo = currentKg - targets.weightKg;
  const needed = toGo / weeksLeft;
  return { toGo, weeksLeft, neededKgPerWeek: needed, neededPctPerWeek: (100 * needed) / currentKg };
}

/** The recommended band for a loss that keeps muscle, percent of bodyweight a week. */
export const KEEP_MUSCLE_LOSS_PCT = { min: 0.5, max: 1 } as const;
