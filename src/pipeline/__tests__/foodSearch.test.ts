import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryFrom, historyFoods, isBarcode, matches, normalize, readOffProduct, readSlvNutrients, searchHistory } from '../foodSearch';
import type { FoodEntry } from '../foodLog';
import type { CivilDate } from '../../lib/date';

// Made-up foods and numbers.
const e = (date: string, food: string, grams: number | null, kcal: number, meal: FoodEntry['meal'] = 'breakfast'): FoodEntry => ({
  date: date as CivilDate, meal, food, grams, kcal, protein: kcal / 20, carbs: kcal / 10, fat: kcal / 50, satFat: null, salt: 0.1,
});

test('words match anywhere, accents aside, but å, ä and ö stay letters of their own', () => {
  assert.equal(normalize('  Crème   Fraîche '), 'creme fraiche');
  assert.equal(normalize('Grönsaker'), 'grönsaker');
  assert.ok(matches('Lätt crème fraîche bearnaise', 'creme bea'));
  assert.ok(!matches('Gronsaker', 'grön'));
  assert.ok(!matches('Oats', ''));
});

test('a barcode is 8 to 14 digits', () => {
  assert.ok(isBarcode('7318690058274'));
  assert.ok(!isBarcode('1234'));
  assert.ok(!isBarcode('73186900582a4'));
});

test('history: one per food, the latest, scaled to 100 g; no weight, no entry', () => {
  const foods = historyFoods([e('2026-01-01', 'Oats', 50, 200), e('2026-01-03', 'oats', 80, 300, 'lunch'), e('2026-01-02', 'Soup', null, 150)]);
  assert.equal(foods.length, 1);
  assert.equal(foods[0].name, 'oats');
  assert.equal(foods[0].per100.kcal, 375);
  assert.equal(foods[0].lastGrams, 80);
  assert.equal(foods[0].lastMeal, 'lunch');
});

test('history search puts names that start with the query first', () => {
  const foods = historyFoods([e('2026-01-01', 'Greek yoghurt', 100, 60), e('2026-01-01', 'Yoghurt drink', 100, 70)]);
  assert.deepEqual(searchHistory(foods, 'yog').map((f) => f.name), ['Yoghurt drink', 'Greek yoghurt']);
});

test('a found food becomes an entry for the grams eaten, brand in the name once', () => {
  const m = { source: 'off' as const, id: '1', name: 'Honey', brand: 'Acme', per100: { kcal: 320, protein: 0, carbs: 79, fat: 0, satFat: 0, salt: 0.02 } };
  const x = entryFrom(m, 42, '2026-01-05' as CivilDate, 'meal2');
  assert.equal(x.food, 'Honey (Acme)');
  assert.equal(x.kcal, 134);
  assert.equal(x.carbs, 33.2);
  assert.equal(x.salt, 0);
  assert.equal(entryFrom({ ...m, name: 'Acme honey' }, 10, '2026-01-05' as CivilDate, 'meal2').food, 'Acme honey');
});

test('Open Food Facts: needs the four numbers; kJ becomes kcal; Swedish name first', () => {
  const p = { code: '123', product_name: 'Fries', product_name_sv: 'Pommes', brands: 'Acme, Other', nutriments: { 'energy-kj_100g': 643, proteins_100g: 2.5, carbohydrates_100g: 27, fat_100g: 3.5, 'saturated-fat_100g': 0.4, salt_100g: 0.15 } };
  const m = readOffProduct(p)!;
  assert.equal(m.name, 'Pommes');
  assert.equal(m.brand, 'Acme');
  assert.equal(m.per100.kcal, 154);
  assert.equal(m.per100.satFat, 0.4);
  assert.equal(readOffProduct({ ...p, nutriments: { proteins_100g: 1 } }), null);
});

test('Livsmedelsverket: values by EuroFIR code, energy in kcal not kJ', () => {
  const list = [
    { euroFIRkod: 'ENERC', enhet: 'kJ', varde: 371 },
    { euroFIRkod: 'ENERC', enhet: 'kcal', varde: 88 },
    { euroFIRkod: 'PROT', enhet: 'g', varde: 1.1 },
    { euroFIRkod: 'CHO', enhet: 'g', varde: 20.1 },
    { euroFIRkod: 'FAT', enhet: 'g', varde: 0.2 },
    { euroFIRkod: 'NACL', enhet: 'g', varde: 0 },
  ];
  assert.deepEqual(readSlvNutrients(list), { kcal: 88, protein: 1.1, carbs: 20.1, fat: 0.2, satFat: null, salt: 0 });
  assert.equal(readSlvNutrients(list.slice(0, 2)), null);
});
