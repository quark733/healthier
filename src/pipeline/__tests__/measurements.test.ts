import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../lib/date';
import { bpSummary, readMeasurement, waistSummary, type Measurement } from '../measurements';
import { caffeineEffect, type Checkin } from '../checkin';

const TODAY = '2026-11-06';
const bp = (date: string, sys: number, dia: number): Measurement => ({ kind: 'bp', at: `${date}T07:00:00Z`, date, sys, dia, pulse: 60 });

test('readings are checked before they are kept', () => {
  assert.ok(readMeasurement({ kind: 'bp', at: '2026-11-06T07:00:00Z', date: TODAY, sys: 128, dia: 82, pulse: 61 }));
  assert.equal(readMeasurement({ kind: 'bp', at: '2026-11-06T07:00:00Z', date: TODAY, sys: 80, dia: 90 }), null);
  assert.equal(readMeasurement({ kind: 'bp', at: 'nope', date: TODAY, sys: 128, dia: 82 }), null);
  assert.equal(readMeasurement({ kind: 'waist', at: '2026-11-06T07:00:00Z', date: TODAY, cm: 12 }), null);
  assert.equal((readMeasurement({ kind: 'waist', at: '2026-11-06T07:00:00Z', date: TODAY, cm: 112.34 }) as any).cm, 112.3);
});

test('the home average leaves out the first day of a measuring week, and flags 135/85', () => {
  const list = [bp(addDays(TODAY, -6), 160, 100), ...[5, 4, 3, 2, 1, 0].map((i) => bp(addDays(TODAY, -i), 130, 84))];
  const s = bpSummary(list, TODAY)!;
  assert.equal(s.n, 6);
  assert.equal(s.sys, 130);
  assert.equal(s.high, false);
  const high = bpSummary([...[3, 2, 1, 0].map((i) => bp(addDays(TODAY, -i), 138, 86)), bp(addDays(TODAY, -4), 138, 86)], TODAY)!;
  assert.equal(high.high, true);
});

test('waist: change over 4 weeks and waist to height', () => {
  const w = (date: string, cm: number): Measurement => ({ kind: 'waist', at: `${date}T07:00:00Z`, date, cm });
  const s = waistSummary([w(addDays(TODAY, -28), 128), w(addDays(TODAY, -14), 126), w(TODAY, 124.5)], 190, TODAY)!;
  assert.equal(s.change4w, -3.5);
  assert.ok(Math.abs(s.ratio! - 0.655) < 0.001);
  assert.equal(s.band, 'high');
  assert.equal(waistSummary([w(TODAY, 100)], 190, TODAY)!.band, 'increased');
  assert.equal(waistSummary([w(TODAY, 90)], 190, TODAY)!.band, 'healthy');
});

test('late caffeine against none, once there are 4 mornings of each', () => {
  const c = (i: number, late: boolean, sleep: number): Checkin => ({ date: addDays(TODAY, -i), sleep, fatigue: 4, soreness: 4, stress: 4, mood: 4, lateCaffeine: late });
  const list = [c(1, true, 3), c(2, true, 2), c(3, true, 3), c(4, false, 4), c(5, false, 4), c(6, false, 5), c(7, false, 4)];
  assert.equal(caffeineEffect(list, () => null, TODAY), null);
  const more = [...list, c(8, true, 3)];
  const e = caffeineEffect(more, (d) => (more.find((x) => x.date === d)!.lateCaffeine ? 400 : 460), TODAY)!;
  assert.equal(e.withN, 4);
  assert.equal(e.ratingWith, 2.75);
  assert.equal(e.ratingWithout, 4.25);
  assert.equal(e.minutesWithout! - e.minutesWith!, 60);
});
