import type { CivilDate } from '../lib/date';
import type { DailyRecord } from '../types/health';

/**
 * The food diary: what was eaten, item by item, written by Claude over MCP (server/mcp.ts) or
 * pasted on the Nutrition page. A day with entries here is the day's food: the numbers a diary
 * app sent through Google Health for that day are set aside, so nothing is counted twice. Days
 * without entries keep what Google Health has, so older history and the burn estimate carry on.
 */

export const MEALS = ['breakfast', 'meal2', 'lunch', 'dinner', 'evening', 'snack'] as const;
export type Meal = (typeof MEALS)[number];

export interface FoodEntry {
  id?: string;
  date: CivilDate;
  meal: Meal;
  food: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number | null;
  salt: number | null;
}

export interface FoodTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number;
  salt: number;
  items: number;
}

/** The source name a diary day carries in sourceByType. */
export const DIARY_SOURCE = 'food-diary';

const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function amount(v: unknown, max: number): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
}

/** Meal names as people write them, in English or Swedish. */
const MEAL_WORDS: Record<string, Meal> = {
  breakfast: 'breakfast', frukost: 'breakfast', 'meal 1': 'breakfast', 'måltid 1': 'breakfast',
  meal2: 'meal2', 'meal 2': 'meal2', 'måltid 2': 'meal2', preworkout: 'meal2', 'före träning': 'meal2',
  lunch: 'lunch',
  dinner: 'dinner', middag: 'dinner',
  evening: 'evening', kvällsmål: 'evening', kvall: 'evening', kväll: 'evening',
  snack: 'snack', mellanmål: 'snack',
};

export function readMeal(v: unknown): Meal | null {
  if (typeof v !== 'string') return null;
  return MEAL_WORDS[v.trim().toLowerCase()] ?? null;
}

/** An entry from storage or a request, or null when it isn't one. */
export function readFoodEntry(raw: unknown): FoodEntry | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const meal = readMeal(o.meal);
  const food = typeof o.food === 'string' ? o.food.trim().slice(0, 120) : '';
  const kcal = amount(o.kcal, 10_000);
  const protein = amount(o.protein, 1_000);
  const carbs = amount(o.carbs, 2_000);
  const fat = amount(o.fat, 1_000);
  if (!isDate(o.date) || !meal || !food || kcal === null || protein === null || carbs === null || fat === null) return null;
  return {
    id: typeof o.id === 'string' ? o.id : undefined,
    date: o.date,
    meal,
    food,
    grams: o.grams === null || o.grams === undefined || o.grams === '' ? null : amount(o.grams, 10_000),
    kcal,
    protein,
    carbs,
    fat,
    satFat: o.satFat === null || o.satFat === undefined || o.satFat === '' ? null : amount(o.satFat, 1_000),
    salt: o.salt === null || o.salt === undefined || o.salt === '' ? null : amount(o.salt, 200),
  };
}

/** Lines "date; meal; food; grams; kcal; protein; carbs; fat; saturated fat; salt" (the last three may be empty). */
export function parseFoodImport(text: string): { entries: FoodEntry[]; unread: string[] } {
  const entries: FoodEntry[] = [];
  const unread: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [date, meal, food, grams, kcal, protein, carbs, fat, satFat, salt] = line.split(/[;\t]/).map((p) => p.trim());
    const e = readFoodEntry({ date, meal, food, grams, kcal, protein, carbs, fat, satFat, salt });
    if (e) entries.push(e);
    else unread.push(line);
  }
  return { entries, unread };
}

/** The entry at a new weight, every number scaled with it. Null without a weight to scale from. */
export function scaleEntry(e: FoodEntry, grams: number): FoodEntry | null {
  if (e.grams === null || e.grams <= 0 || !Number.isFinite(grams) || grams <= 0 || grams > 10_000) return null;
  const k = grams / e.grams;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return {
    ...e,
    grams: Math.round(grams * 10) / 10,
    kcal: r(e.kcal),
    protein: r(e.protein),
    carbs: r(e.carbs),
    fat: r(e.fat),
    satFat: e.satFat === null ? null : r(e.satFat),
    salt: e.salt === null ? null : Math.round(e.salt * k * 100) / 100,
  };
}

export function totalsOf(entries: FoodEntry[]): FoodTotals {
  const t: FoodTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, salt: 0, items: 0 };
  for (const e of entries) {
    t.kcal += e.kcal;
    t.protein += e.protein;
    t.carbs += e.carbs;
    t.fat += e.fat;
    t.satFat += e.satFat ?? 0;
    t.salt += e.salt ?? 0;
    t.items += 1;
  }
  return t;
}

export function byDate(entries: FoodEntry[]): Map<CivilDate, FoodEntry[]> {
  const out = new Map<CivilDate, FoodEntry[]>();
  for (const e of entries) {
    const list = out.get(e.date) ?? [];
    list.push(e);
    out.set(e.date, list);
  }
  return out;
}

/** A day's entries grouped by meal, in meal order, with each meal's totals. */
export function mealsOf(entries: FoodEntry[]): { meal: Meal; entries: FoodEntry[]; totals: FoodTotals }[] {
  return MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    return { meal, entries: list, totals: totalsOf(list) };
  }).filter((m) => m.entries.length > 0);
}

/**
 * The days with the diary's food in place of a diary app's: a day with entries takes its
 * energy and macros from them. Other days are left as they are. Returns new records.
 */
export function applyFoodLog(days: DailyRecord[], entries: FoodEntry[]): DailyRecord[] {
  if (!entries.length) return days;
  const dated = byDate(entries);
  return days.map((d) => {
    const list = dated.get(d.date);
    if (!list) return d;
    const t = totalsOf(list);
    return {
      ...d,
      caloriesKcal: Math.round(t.kcal),
      proteinG: Math.round(t.protein),
      carbsG: Math.round(t.carbs),
      fatG: Math.round(t.fat),
      present: d.present.includes('nutrition-log') ? d.present : [...d.present, 'nutrition-log'],
      sourceByType: { ...d.sourceByType, 'nutrition-log': DIARY_SOURCE },
    };
  });
}

/**
 * A meal eaten again and again (a breakfast, a prepped lunch box), saved once and logged with one
 * tap or one word to Claude. Items keep their weights and numbers; `portion` scales them all.
 */
export interface SavedMeal {
  id?: string;
  name: string;
  meal: Meal;
  items: Omit<FoodEntry, 'id' | 'date' | 'meal'>[];
}

export function readSavedMeal(raw: unknown): SavedMeal | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
  const meal = readMeal(o.meal);
  if (!name || !meal || !Array.isArray(o.items) || !o.items.length || o.items.length > 40) return null;
  const items: SavedMeal['items'] = [];
  for (const it of o.items) {
    const e = readFoodEntry({ ...(it as object), date: '2000-01-01', meal });
    if (!e) return null;
    const { id: _id, date: _date, meal: _meal, ...rest } = e;
    items.push(rest);
  }
  return { id: typeof o.id === 'string' ? o.id : undefined, name, meal, items };
}

/** The saved meal as diary entries on a day, every amount times `portion` (1 = as saved). */
export function savedMealEntries(m: SavedMeal, date: CivilDate, portion = 1, meal: Meal = m.meal): FoodEntry[] {
  const k = Number.isFinite(portion) && portion > 0 && portion <= 5 ? portion : 1;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return m.items.map((i) => ({
    ...i,
    date,
    meal,
    grams: i.grams === null ? null : r(i.grams),
    kcal: r(i.kcal),
    protein: r(i.protein),
    carbs: r(i.carbs),
    fat: r(i.fat),
    satFat: i.satFat === null ? null : r(i.satFat),
    salt: i.salt === null ? null : Math.round(i.salt * k * 100) / 100,
  }));
}

/** The mean of the days that have food logged among the seven ending `end`. */
export function weekAverage(days: DailyRecord[], end: CivilDate): { kcal: number; protein: number; days: number } | null {
  const start = new Date(Date.parse(end) - 6 * 86_400_000).toISOString().slice(0, 10);
  const logged = days.filter((d) => d.date >= start && d.date <= end && (d.caloriesKcal ?? 0) > 0);
  if (!logged.length) return null;
  const sum = (f: (d: DailyRecord) => number) => logged.reduce((a, d) => a + f(d), 0);
  return { kcal: sum((d) => d.caloriesKcal ?? 0) / logged.length, protein: sum((d) => d.proteinG ?? 0) / logged.length, days: logged.length };
}
