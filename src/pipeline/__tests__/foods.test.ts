import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, suggest } from '../foods';
import { readTargets, weightPace } from '../targets';

describe('ideas for the rest of the day', () => {
  it('puts protein first while it is behind, the most protein per kilocalorie first', () => {
    const s = suggest({ kcal: 900, proteinG: 60, carbsG: 120, fatG: 20 })!;
    assert.equal(s.focus, 'protein');
    assert.equal(s.foods.length, 3);
    const ratio = (f: (typeof FOODS)[number]) => f.proteinG / f.kcal;
    assert.ok(ratio(s.foods[0]) >= ratio(s.foods[1]) && ratio(s.foods[1]) >= ratio(s.foods[2]));
  });

  it('moves on to carbohydrate once protein is met, and never past the energy left', () => {
    const s = suggest({ kcal: 250, proteinG: 4, carbsG: 80, fatG: 30 })!;
    assert.equal(s.focus, 'carbs');
    assert.ok(s.foods.every((f) => f.kcal <= 250 && f.carbsG > 0));
  });

  it('has nothing to suggest when the day is done or nothing is behind', () => {
    assert.equal(suggest({ kcal: 50, proteinG: 40, carbsG: 40, fatG: 10 }), null);
    assert.equal(suggest({ kcal: 600, proteinG: 2, carbsG: 5, fatG: 1 }), null);
  });
});

describe('targets', () => {
  it('reads what is in bounds and leaves the rest unset', () => {
    assert.deepEqual(readTargets({ kcal: 3300, proteinG: 206, carbsG: 'lots', fatG: 9999, weightKg: 119, weightBy: '2027-06-01' }), {
      kcal: 3300, proteinG: 206, carbsG: null, fatG: null, weightKg: 119, weightBy: '2027-06-01',
    });
    assert.equal(readTargets({ weightBy: 'summer' }).weightBy, null);
  });

  it('works out the weekly pace a target weight needs', () => {
    const p = weightPace(134, readTargets({ weightKg: 119, weightBy: '2027-06-01' }), '2026-11-03')!;
    assert.equal(Math.round(p.weeksLeft), 30);
    assert.equal(Math.round(p.neededKgPerWeek * 100) / 100, 0.5);
    assert.equal(Math.round(p.neededPctPerWeek * 100) / 100, 0.37);
    assert.equal(weightPace(134, readTargets({ weightKg: 119 }), '2026-11-03'), null);
  });
});
