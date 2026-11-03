/**
 * Ideas for what fits the rest of the day: common foods at an everyday portion, chosen by plain
 * arithmetic on what's left of the day's targets. No model picks them, and the same day always
 * gives the same ideas.
 *
 * The values are typical ones per portion, rounded, as found on Swedish product labels and in
 * food composition tables; a given product differs, so its own label is the one to log.
 */

export interface Food {
  id: string;
  /** The portion, in grams or millilitres, as eaten. */
  portion: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Per portion. Names are in the language file, under nutrition.foods. */
export const FOODS: Food[] = [
  { id: 'quark', portion: 250, kcal: 160, proteinG: 28, carbsG: 9, fatG: 1 },
  { id: 'skyr', portion: 200, kcal: 125, proteinG: 22, carbsG: 8, fatG: 0 },
  { id: 'cottageCheese', portion: 200, kcal: 195, proteinG: 24, carbsG: 6, fatG: 8 },
  { id: 'chicken', portion: 150, kcal: 165, proteinG: 34, carbsG: 0, fatG: 3 },
  { id: 'tuna', portion: 120, kcal: 130, proteinG: 30, carbsG: 0, fatG: 1 },
  { id: 'eggs', portion: 120, kcal: 170, proteinG: 15, carbsG: 1, fatG: 12 },
  { id: 'wheyShake', portion: 30, kcal: 115, proteinG: 24, carbsG: 2, fatG: 2 },
  { id: 'salmon', portion: 125, kcal: 240, proteinG: 25, carbsG: 0, fatG: 15 },
  { id: 'mince', portion: 125, kcal: 215, proteinG: 25, carbsG: 0, fatG: 13 },
  { id: 'oats', portion: 60, kcal: 220, proteinG: 8, carbsG: 36, fatG: 4 },
  { id: 'rice', portion: 200, kcal: 260, proteinG: 5, carbsG: 57, fatG: 1 },
  { id: 'potatoes', portion: 250, kcal: 200, proteinG: 5, carbsG: 43, fatG: 0 },
  { id: 'pasta', portion: 200, kcal: 300, proteinG: 11, carbsG: 60, fatG: 2 },
  { id: 'bread', portion: 80, kcal: 190, proteinG: 7, carbsG: 33, fatG: 3 },
  { id: 'banana', portion: 120, kcal: 105, proteinG: 1, carbsG: 24, fatG: 0 },
  { id: 'peanutButter', portion: 30, kcal: 185, proteinG: 7, carbsG: 4, fatG: 15 },
  { id: 'nuts', portion: 30, kcal: 180, proteinG: 6, carbsG: 3, fatG: 15 },
  { id: 'oliveOil', portion: 10, kcal: 90, proteinG: 0, carbsG: 0, fatG: 10 },
];

export interface Remaining {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface Suggestion {
  /** The macro this idea is for: the one with the most of its target left. */
  focus: 'protein' | 'carbs' | 'fat';
  foods: Food[];
}

/** Below this much left, a macro counts as met. */
const ENOUGH = { protein: 10, carbs: 20, fat: 8 } as const;

/**
 * What's left of each target, and up to three foods that go towards the macro furthest from its
 * target without passing the energy left. Protein comes first when it's behind, since it's the one
 * that most helps keep muscle while eating less (Helms et al. 2014).
 */
export function suggest(left: Remaining, max = 3): Suggestion | null {
  const kcalLeft = left.kcal;
  if (kcalLeft !== null && kcalLeft < 80) return null;
  const share = (key: 'proteinG' | 'carbsG' | 'fatG', min: number) => (left[key] !== null && left[key]! >= min ? left[key]! : null);
  const protein = share('proteinG', ENOUGH.protein);
  const carbs = share('carbsG', ENOUGH.carbs);
  const fat = share('fatG', ENOUGH.fat);
  const focus: Suggestion['focus'] | null = protein !== null ? 'protein' : carbs !== null ? 'carbs' : fat !== null ? 'fat' : null;
  if (!focus) return null;
  const key = focus === 'protein' ? 'proteinG' : focus === 'carbs' ? 'carbsG' : 'fatG';
  const need = left[key]!;
  const fits = FOODS.filter((f) => (kcalLeft === null || f.kcal <= kcalLeft) && f[key] > 0)
    // Most of the macro per kilocalorie, and no portion that goes far past what's left of it.
    .filter((f) => f[key] <= need * 1.5)
    .sort((a, b) => b[key] / b.kcal - a[key] / a.kcal || a.kcal - b.kcal);
  return fits.length ? { focus, foods: fits.slice(0, max) } : null;
}
