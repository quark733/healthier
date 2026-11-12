import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFoodLog, DIARY_SOURCE, mealsOf, parseFoodImport, readFoodEntry, readMeal, totalsOf } from '../foodLog';
import { emptyRecord } from '../normalize';
import type { CivilDate } from '../../lib/date';

// Made-up food, not a real person's diary.
const PASTE = `
# date; meal; food; grams; kcal; protein; carbs; fat; sat fat; salt
2026-01-05; frukost; Oats; 80; 300; 10; 50; 6; 1; 0
2026-01-05; breakfast; Whey; 30; 117; 23; 2; 2; 1,2; 0,1
2026-01-05; Middag; Rice, cooked; 300; 390; 8; 85; 1;;
2026-01-06; kvällsmål; Yoghurt 0 %; 200; 118; 19; 8; 0,4; 0,2; 0,3
not a line
2026-01-07; brunch; Pancakes; 100; 200; 6; 30; 6; 2; 0,5
`;

test('pasted lines are read, with Swedish meal names and comma decimals', () => {
  const { entries, unread } = parseFoodImport(PASTE);
  assert.equal(entries.length, 4);
  assert.deepEqual(unread, ['not a line', '2026-01-07; brunch; Pancakes; 100; 200; 6; 30; 6; 2; 0,5']);
  assert.equal(entries[0].meal, 'breakfast');
  assert.equal(entries[1].satFat, 1.2);
  assert.equal(entries[2].meal, 'dinner');
  assert.equal(entries[2].satFat, null);
  assert.equal(entries[2].food, 'Rice, cooked');
  assert.equal(entries[3].meal, 'evening');
});

test('meal names: Swedish, English and the pre-training meal', () => {
  assert.equal(readMeal('Måltid 2'), 'meal2');
  assert.equal(readMeal('lunch'), 'lunch');
  assert.equal(readMeal('supper'), null);
});

test('entries need a date, a meal, a name and all four numbers', () => {
  assert.equal(readFoodEntry({ date: '2026-01-05', meal: 'lunch', food: 'X', kcal: 100, protein: 1, carbs: 1 }), null);
  assert.equal(readFoodEntry({ date: '2026-13-40', meal: 'lunch', food: 'X', kcal: 100, protein: 1, carbs: 1, fat: 1 }), null);
  assert.equal(readFoodEntry({ date: '2026-01-05', meal: 'lunch', food: 'X', kcal: -5, protein: 1, carbs: 1, fat: 1 }), null);
  assert.ok(readFoodEntry({ date: '2026-01-05', meal: 'lunch', food: 'X', kcal: 100, protein: 1, carbs: 1, fat: 1 }));
});

test('totals and meals in meal order', () => {
  const { entries } = parseFoodImport(PASTE);
  const day = entries.filter((e) => e.date === '2026-01-05');
  const t = totalsOf(day);
  assert.equal(t.kcal, 807);
  assert.equal(t.protein, 41);
  assert.equal(Math.round(t.satFat * 10) / 10, 2.2);
  assert.deepEqual(mealsOf(day).map((m) => [m.meal, m.entries.length]), [['breakfast', 2], ['dinner', 1]]);
});

test('a diary day replaces the diary app’s food; other days keep theirs', () => {
  const { entries } = parseFoodImport(PASTE);
  const app = { ...emptyRecord('2026-01-05' as CivilDate), caloriesKcal: 2500, proteinG: 150, carbsG: 300, fatG: 80, present: ['nutrition-log'], sourceByType: { 'nutrition-log': 'mfp' } };
  const other = { ...emptyRecord('2026-01-04' as CivilDate), caloriesKcal: 2000, proteinG: 120, carbsG: 250, fatG: 70 };
  const empty = emptyRecord('2026-01-06' as CivilDate);
  const [a, b, c] = applyFoodLog([app, other, empty], entries);
  assert.equal(a.caloriesKcal, 807);
  assert.equal(a.proteinG, 41);
  assert.equal(a.sourceByType['nutrition-log'], DIARY_SOURCE);
  assert.deepEqual(a.present, ['nutrition-log']);
  assert.equal(b, other);
  assert.equal(c.caloriesKcal, 118);
  assert.ok(c.present.includes('nutrition-log'));
});

test('a saved meal is read, logged on a day, and scaled by portion', async () => {
  const { readSavedMeal, savedMealEntries } = await import('../foodLog');
  const m = readSavedMeal({ name: ' Box L ', meal: 'lunch', items: [{ food: 'Rice', grams: 100, kcal: 130, protein: 3, carbs: 28, fat: 0.3, satFat: null, salt: 0 }] });
  assert.ok(m);
  assert.equal(m!.name, 'Box L');
  const [e] = savedMealEntries(m!, '2026-01-05' as CivilDate, 1.5);
  assert.equal(e.date, '2026-01-05');
  assert.equal(e.meal, 'lunch');
  assert.equal(e.grams, 150);
  assert.equal(e.kcal, 195);
  assert.equal(e.satFat, null);
  assert.equal(readSavedMeal({ name: 'X', meal: 'lunch', items: [] }), null);
  assert.equal(readSavedMeal({ name: 'X', meal: 'lunch', items: [{ food: 'Y', kcal: 1 }] }), null);
});

test('the week average counts only the logged days among the last seven', async () => {
  const { weekAverage } = await import('../foodLog');
  const day = (date: string, kcal: number | null, protein: number | null) => ({ ...emptyRecord(date as CivilDate), caloriesKcal: kcal, proteinG: protein });
  const days = [day('2026-01-01', 9000, 900), day('2026-01-03', 3000, 200), day('2026-01-05', null, null), day('2026-01-08', 2000, 100)];
  assert.deepEqual(weekAverage(days, '2026-01-08' as CivilDate), { kcal: 2500, protein: 150, days: 2 });
  assert.equal(weekAverage(days, '2025-12-01' as CivilDate), null);
});
