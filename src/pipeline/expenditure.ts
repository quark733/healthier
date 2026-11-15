import type { Targets } from './targets';
import { KCAL_PER_KG } from './eating';

/**
 * Calories for the goal's pace, from maintenance (pipeline/eating.ts: what was eaten and how the
 * weight moved, the way MacroFactor does it).
 */

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
 * person set it; fat stays too, down to 0.5 g per kg of target weight (or current) at the least;
 * carbohydrate takes the rest, at least 100 g.
 */
export function planFor(exp: { kcal: number }, currentKg: number, pctPerWeek: number, targets: Targets): CaloriePlan {
  const kgPerWeek = (currentKg * pctPerWeek) / 100;
  const kcal = Math.round((exp.kcal - (kgPerWeek * KCAL_PER_KG) / 7) / 10) * 10;
  const protein = targets.proteinG;
  let fat = targets.fatG;
  let carbs: number | null = null;
  if (protein !== null && fat !== null) {
    const minFat = Math.round(0.5 * (targets.weightKg ?? currentKg));
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
