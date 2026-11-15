import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWeekSets } from '../muscles';

// Chest: MEV 6, MAV 12–18, MRV 20.
test('next week: up to MEV, two more toward MAV, hold within it, back to its top above it', () => {
  assert.equal(nextWeekSets('chest', 0), 6);
  assert.equal(nextWeekSets('chest', 3.5), 6);
  assert.equal(nextWeekSets('chest', 7), 9);
  assert.equal(nextWeekSets('chest', 11), 12);
  assert.equal(nextWeekSets('chest', 15.5), 16);
  assert.equal(nextWeekSets('chest', 19), 18);
  assert.equal(nextWeekSets('chest', 24), 18);
});
