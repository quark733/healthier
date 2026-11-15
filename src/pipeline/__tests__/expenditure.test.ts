import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFor } from '../expenditure';
import { EMPTY_TARGETS } from '../targets';

test('a pace becomes calories, with protein kept and carbs taking the change', () => {
  const p = planFor({ kcal: 3550 }, 130, 0.5, { ...EMPTY_TARGETS, kcal: 3300, proteinG: 206, carbsG: 413, fatG: 92, weightKg: 119 });
  assert.ok(Math.abs(p.kgPerWeek - 0.65) < 1e-9);
  assert.equal(p.kcal, 2840);
  assert.equal(p.proteinG, 206);
  assert.equal(p.fatG, 92);
  assert.equal(p.carbsG, Math.round((2840 - 206 * 4 - 92 * 9) / 4));
});

test('a steep pace takes fat down, but not under 0.5 g per kg of the target weight', () => {
  const p = planFor({ kcal: 2400 }, 130, 1, { ...EMPTY_TARGETS, proteinG: 206, fatG: 92, weightKg: 119 });
  assert.equal(p.fatG, 60);
  assert.ok(p.carbsG! >= 0);
});
