import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../lib/date';
import { emptyRecord } from '../normalize';
import { estimateExpenditure, planFor } from '../expenditure';
import { EMPTY_TARGETS } from '../targets';
import type { DailyRecord } from '../../types/health';

const TODAY = '2026-11-07';

/** 28 days eating 3,000 kcal and losing 0.5 kg a week, weighed every other day; two days barely logged. */
function month(): DailyRecord[] {
  return Array.from({ length: 29 }, (_, i) => {
    const date = addDays(TODAY, i - 28);
    const d = emptyRecord(date);
    d.caloriesKcal = i === 5 || i === 12 ? 600 : 3000;
    if (i % 2 === 0) d.weightKg = 130 - (0.5 / 7) * i;
    return d;
  });
}

test('the burn is intake less the change in weight, partial days left out', () => {
  const e = estimateExpenditure(month(), TODAY)!;
  assert.equal(e.intakeKcal, 3000);
  assert.ok(Math.abs(e.kgPerWeek + 0.5) < 0.01);
  assert.equal(e.kcal, 3550);
  assert.equal(e.loggedDays, 26);
  assert.equal(e.confidence, 'good');
});

test('too little logging gives no estimate', () => {
  const days = month().map((d, i) => (i % 3 ? { ...d, caloriesKcal: undefined } : d));
  assert.equal(estimateExpenditure(days, TODAY), null);
});

test('a pace becomes calories, with protein kept and carbs taking the change', () => {
  const e = estimateExpenditure(month(), TODAY)!;
  const p = planFor(e, 130, 0.5, { ...EMPTY_TARGETS, kcal: 3300, proteinG: 206, carbsG: 413, fatG: 92, weightKg: 119 });
  assert.ok(Math.abs(p.kgPerWeek - 0.65) < 1e-9);
  assert.equal(p.kcal, 2840);
  assert.equal(p.proteinG, 206);
  assert.equal(p.fatG, 92);
  assert.equal(p.carbsG, Math.round((2840 - 206 * 4 - 92 * 9) / 4));
});
