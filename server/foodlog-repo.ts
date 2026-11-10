import type { Db } from './db';
import { readFoodEntry, type FoodEntry } from '../src/pipeline/foodLog';

/** The food diary's rows (migration 15), oldest first. */

interface Row {
  id: string;
  date: string;
  meal: string;
  food: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sat_fat: number | null;
  salt: number | null;
}

const COLUMNS = `id::text, to_char(date, 'YYYY-MM-DD') AS date, meal, food, grams, kcal, protein, carbs, fat, sat_fat, salt`;

function toEntry(r: Row): FoodEntry | null {
  return readFoodEntry({ ...r, satFat: r.sat_fat });
}

export async function getFoodEntries(db: Db, userId: string, from?: string, to?: string): Promise<FoodEntry[]> {
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM user_food_log
     WHERE user_id = $1 AND ($2::date IS NULL OR date >= $2::date) AND ($3::date IS NULL OR date <= $3::date)
     ORDER BY date, id`,
    [userId, from ?? null, to ?? null],
  );
  return rows.map(toEntry).filter((e): e is FoodEntry => e !== null);
}

export async function addFoodEntries(db: Db, userId: string, entries: FoodEntry[]): Promise<FoodEntry[]> {
  const out: FoodEntry[] = [];
  for (const e of entries) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO user_food_log (user_id, date, meal, food, grams, kcal, protein, carbs, fat, sat_fat, salt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::text`,
      [userId, e.date, e.meal, e.food, e.grams, e.kcal, e.protein, e.carbs, e.fat, e.satFat, e.salt],
    );
    out.push({ ...e, id: rows[0].id });
  }
  return out;
}

/** Removes the entries for these days, so a pasted day replaces itself instead of adding twice. */
export async function clearFoodDays(db: Db, userId: string, dates: string[]): Promise<void> {
  if (!dates.length) return;
  await db.query('DELETE FROM user_food_log WHERE user_id = $1 AND date = ANY($2::date[])', [userId, dates]);
}

export async function getFoodEntry(db: Db, userId: string, id: string): Promise<FoodEntry | null> {
  if (!/^\d+$/.test(id)) return null;
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM user_food_log WHERE user_id = $1 AND id = $2`, [userId, id]);
  return rows[0] ? toEntry(rows[0]) : null;
}

/** Writes an entry's amounts back (after a change of weight). */
export async function updateFoodAmounts(db: Db, userId: string, e: FoodEntry): Promise<void> {
  await db.query(
    `UPDATE user_food_log SET grams = $3, kcal = $4, protein = $5, carbs = $6, fat = $7, sat_fat = $8, salt = $9
     WHERE user_id = $1 AND id = $2`,
    [userId, e.id, e.grams, e.kcal, e.protein, e.carbs, e.fat, e.satFat, e.salt],
  );
}

export async function deleteFoodEntry(db: Db, userId: string, id: string): Promise<boolean> {
  if (!/^\d+$/.test(id)) return false;
  const r = await db.query('DELETE FROM user_food_log WHERE user_id = $1 AND id = $2', [userId, id]);
  return (r.rowCount ?? 0) > 0;
}
