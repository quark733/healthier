import type { CivilDate } from '../lib/date';
import type { FoodEntry, Meal } from './foodLog';

/**
 * Finding a food to log: in what the person has eaten before (their diary), and in two open
 * databases the server asks (server/foodsearch.ts): Open Food Facts for packaged food, by name
 * or barcode, and Livsmedelsverket's food composition database for plain food (banana, egg,
 * chicken breast). Everything is per 100 g; logging scales it to the grams eaten.
 */

export type FoodSource = 'history' | 'off' | 'slv';

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number | null;
  salt: number | null;
}

export interface FoodMatch {
  source: FoodSource;
  /** History: the food's name; Open Food Facts: the barcode; Livsmedelsverket: its number. */
  id: string;
  name: string;
  brand: string | null;
  per100: Per100;
  /** History only: the grams last eaten, a good default for next time. */
  lastGrams?: number | null;
  /** History only: the meal it was last eaten at. */
  lastMeal?: Meal;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Lower case, accents off (so "creme" finds "crème"), å/ä/ö kept apart from a/o by keeping them. */
export function normalize(s: string): string {
  const keep: Record<string, string> = { å: '\u0001', ä: '\u0002', ö: '\u0003' };
  const back: Record<string, string> = { '\u0001': 'å', '\u0002': 'ä', '\u0003': 'ö' };
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[åäö]/g, (c) => keep[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0001-\u0003]/g, (c) => back[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query is in the text, anywhere. */
export function matches(text: string, query: string): boolean {
  const hay = normalize(text);
  const words = normalize(query).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => hay.includes(w));
}

/** A barcode typed or scanned: 8 to 14 digits. */
export function isBarcode(q: string): boolean {
  return /^\d{8,14}$/.test(q.trim());
}

/**
 * The foods eaten before, one each (the latest time it was eaten counts), with their values per
 * 100 g worked out from what was logged. Entries without a weight can't be scaled and are left out.
 */
export function historyFoods(entries: FoodEntry[]): FoodMatch[] {
  const latest = new Map<string, FoodEntry>();
  for (const e of entries) {
    if (!e.grams || e.grams <= 0) continue;
    const key = normalize(e.food);
    const had = latest.get(key);
    if (!had || e.date >= had.date) latest.set(key, e);
  }
  return [...latest.values()].map((e) => {
    const f = 100 / e.grams!;
    return {
      source: 'history' as const,
      id: e.food,
      name: e.food,
      brand: null,
      per100: {
        kcal: r1(e.kcal * f),
        protein: r1(e.protein * f),
        carbs: r1(e.carbs * f),
        fat: r1(e.fat * f),
        satFat: e.satFat === null ? null : r1(e.satFat * f),
        salt: e.salt === null ? null : r1(e.salt * f),
      },
      lastGrams: e.grams,
      lastMeal: e.meal,
    };
  });
}

/** The history's foods that match, the ones whose name starts with the query first. */
export function searchHistory(foods: FoodMatch[], query: string, limit = 8): FoodMatch[] {
  const q = normalize(query);
  return foods
    .filter((f) => matches(f.name, query))
    .sort((a, b) => Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** A found food as a diary entry for the grams eaten. */
export function entryFrom(m: FoodMatch, grams: number, date: CivilDate, meal: Meal): FoodEntry {
  const f = grams / 100;
  const p = m.per100;
  return {
    date,
    meal,
    food: m.brand && !normalize(m.name).includes(normalize(m.brand)) ? `${m.name} (${m.brand})` : m.name,
    grams: r1(grams),
    kcal: Math.round(p.kcal * f),
    protein: r1(p.protein * f),
    carbs: r1(p.carbs * f),
    fat: r1(p.fat * f),
    satFat: p.satFat === null ? null : r1(p.satFat * f),
    salt: p.salt === null ? null : r1(p.salt * f),
  };
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * An Open Food Facts product (its `product` object) as a match, or null without the numbers
 * needed: energy, protein, carbs and fat per 100 g. Energy given only in kJ is turned into kcal.
 */
export function readOffProduct(p: unknown): FoodMatch | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, any>;
  const n = (o.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy-kj_100g']) ?? (n['energy_unit'] === 'kJ' ? num(n['energy_100g']) : null);
  const kcal = num(n['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184);
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  const name = String(o.product_name_sv || o.product_name || o.generic_name || '').trim();
  const code = String(o.code ?? o._id ?? '').trim();
  if (kcal === null || protein === null || carbs === null || fat === null || !name || !code) return null;
  const brand = String(o.brands ?? '').split(',')[0].trim() || null;
  return {
    source: 'off',
    id: code,
    name: name.slice(0, 100),
    brand: brand?.slice(0, 40) ?? null,
    per100: {
      kcal: Math.round(kcal),
      protein: r1(protein),
      carbs: r1(carbs),
      fat: r1(fat),
      satFat: num(n['saturated-fat_100g']) === null ? null : r1(num(n['saturated-fat_100g'])!),
      salt: num(n['salt_100g']) === null ? null : r1(num(n['salt_100g'])!),
    },
  };
}

/**
 * Livsmedelsverket's nutrient values for one food (`/livsmedel/{nummer}/naringsvarden`) as values
 * per 100 g, by their EuroFIR codes: ENERC in kcal, PROT, CHO (available carbohydrate), FAT,
 * FASAT and NACL. Null when energy or a macro is missing.
 */
export function readSlvNutrients(list: unknown): Per100 | null {
  if (!Array.isArray(list)) return null;
  const by = (code: string, unit?: string) => {
    const hit = list.find((x: any) => x?.euroFIRkod === code && (unit === undefined || String(x?.enhet ?? '').toLowerCase() === unit));
    return hit ? num((hit as any).varde) : null;
  };
  const kcal = by('ENERC', 'kcal');
  const protein = by('PROT');
  const carbs = by('CHO');
  const fat = by('FAT');
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  const sat = by('FASAT');
  const salt = by('NACL');
  return { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat), satFat: sat === null ? null : r1(sat), salt: salt === null ? null : r1(salt) };
}
