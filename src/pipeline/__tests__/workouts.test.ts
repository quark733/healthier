import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, parseWorkout, sameSession, workoutWeek } from '../workouts';
import { STREAMS } from '../registry';
import { emptyRecord } from '../normalize';

const point = (start: string, end: string, extra: Record<string, unknown> = {}) => ({
  interval: { startTime: start, startUtcOffset: '3600s', endTime: end, endUtcOffset: '3600s' },
  ...extra,
});

test('exercise types fold into kinds', () => {
  assert.equal(kindOf('RUNNING'), 'run');
  assert.equal(kindOf('STRENGTH_TRAINING'), 'strength');
  assert.equal(kindOf('WEIGHTLIFTING'), 'strength');
  assert.equal(kindOf('BIKING'), 'bike');
  assert.equal(kindOf('AEROBIC_WORKOUT'), 'cardio');
  assert.equal(kindOf('WALKING'), 'walk');
  assert.equal(kindOf('SOMETHING_NEW'), 'other');
  assert.equal(kindOf(undefined), 'other');
});

test('a session is read with what it has', () => {
  const w = parseWorkout(point('2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', {
    exerciseType: 'STRENGTH_TRAINING', displayName: 'Upper body', activeDuration: '3000s',
    metricsSummary: { caloriesKcal: 310.4, averageHeartRateBeatsPerMinute: '121', distanceMillimeters: 0 },
  }))!;
  assert.equal(w.kind, 'strength');
  assert.equal(w.name, 'Upper body');
  assert.equal(w.minutes, 50);
  assert.equal(w.kcal, 310);
  assert.equal(w.avgHr, 121);
  assert.equal(w.distanceKm, null);
  assert.equal(w.startMinute, 17 * 60); // local time, +1 h
  assert.equal(parseWorkout(point('2026-11-03T17:00:00Z', '2026-11-03T16:00:00Z')), null);
  assert.equal(parseWorkout(point('2026-11-03T00:00:00Z', '2026-11-04T00:00:00Z')), null);
});

test('the same session from two apps counts once, keeping what each knows', () => {
  const stream = STREAMS.find((s) => s.dataType === 'exercise')!;
  const row = emptyRecord('2026-11-03');
  const watch = point('2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', { exerciseType: 'STRENGTH_TRAINING', metricsSummary: { averageHeartRateBeatsPerMinute: '118' } });
  const app = point('2026-11-03T16:02:00Z', '2026-11-03T16:58:00Z', { exerciseType: 'STRENGTH_TRAINING', displayName: 'Ben' });
  const run = point('2026-11-03T06:00:00Z', '2026-11-03T06:30:00Z', { exerciseType: 'RUNNING' });
  assert.equal(stream.dateOf(watch, {}), '2026-11-03');
  for (const p of [watch, app, run]) stream.apply({ row }, p, {});
  assert.equal(row.workouts!.length, 2);
  assert.equal(row.workouts![0].kind, 'run');
  assert.equal(row.workouts![1].name, 'Ben');
  assert.equal(row.workouts![1].avgHr, 118);
  assert.ok(sameSession(parseWorkout(watch)!, parseWorkout(app)!));
  assert.ok(!sameSession(parseWorkout(watch)!, parseWorkout(run)!));
  const week = workoutWeek([row], '2026-11-04');
  assert.deepEqual(week, { sessions: 2, strength: 1, cardioMinutes: 30, kcal: 0 });
});
