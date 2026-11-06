import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stalling, trainingDose } from '../trainingDose';
import { emptyRecord } from '../normalize';
import { addDays } from '../../lib/date';
import type { DailyRecord } from '../../types/health';
import type { StrengthSession } from '../strength';

const TODAY = '2026-11-06';
const night = (date: string, minutes: number) => ({ ...emptyRecord(date), sleep: { date, minutesAsleep: minutes, isMainSleep: true, isNap: false } as any });
const weekOfSleep = (minutes: number): DailyRecord[] => Array.from({ length: 35 }, (_, i) => night(addDays(TODAY, i - 34), minutes));
const set = (loadKg: number, reps: number, count: number) => ({ loadKg, reps, count, bodyweight: false, failed: false, rpe: null, max: false });
const session = (date: string, name: string, kg: number, reps = 8, count = 3, ratings?: StrengthSession['ratings']): StrengthSession => ({
  date, name: 'Pass', durationMin: 60, rawDurationMin: null, bodyweightKg: null, notes: [], ratings,
  exercises: [{ name, sets: [set(kg, reps, count)], unread: [] }],
});

test('a normal day: work sets 1–3 in reserve, all sets', () => {
  const d = trainingDose({ days: weekOfSleep(480), sessions: [], today: TODAY, readiness: null });
  assert.equal(d.level, 'full');
  assert.deepEqual(d.rir, [1, 3]);
  assert.deepEqual(d.rpe, [7, 9]);
  assert.equal(d.setsShare, 1);
});

test('a short night takes one step down', () => {
  const days = weekOfSleep(480);
  days[days.length - 1] = night(TODAY, 320);
  const d = trainingDose({ days, sessions: [], today: TODAY, readiness: null });
  assert.equal(d.level, 'reduced');
  assert.deepEqual(d.reasons, ['shortSleep']);
  assert.deepEqual(d.rir, [2, 4]);
});

test('low ratings and a drained battery stack, but never past light', () => {
  const days = weekOfSleep(480);
  days[days.length - 1] = night(TODAY, 300);
  const sessions = [session(addDays(TODAY, -1), 'Bänkpress', 100, 5, 3, { sleep: 2, stress: 6, form: 5 })];
  const readiness = { score: 25, parts: [], confidence: 'high', label: '', missing: [], calibrating: [] } as any;
  const d = trainingDose({ days, sessions, today: TODAY, readiness });
  assert.equal(d.level, 'light');
  assert.deepEqual(d.reasons, ['shortSleep', 'battery', 'ratedLow']);
  assert.ok(d.recovering.includes('chest'));
  assert.ok(!d.ready.includes('chest'));
});

test('illness signals mean rest', () => {
  const readiness = { score: 50, confidence: 'high', label: '', missing: [], calibrating: [],
    parts: [{ id: 'breathing', contribution: -3 }, { id: 'skinTemp', contribution: -2 }] } as any;
  const d = trainingDose({ days: weekOfSleep(480), sessions: [], today: TODAY, readiness });
  assert.equal(d.level, 'rest');
  assert.equal(d.rir, null);
});

test('a deficit, its pace and short sleep while dieting are noted', () => {
  const days = weekOfSleep(390).map((d, i) => ({ ...d, weightKg: 130 - i * 0.2 })); // ~1.4 kg a week
  const d = trainingDose({ days, sessions: [], today: TODAY, readiness: null });
  assert.ok(d.notes.includes('deficit'));
  assert.ok(d.notes.includes('fastLoss'));
  assert.ok(d.notes.includes('sleepWhileDieting'));
  assert.ok(d.facts.deficitKcal! > 1000);
});

test('two main lifts well under their best suggest a lighter week', () => {
  const s: StrengthSession[] = [];
  for (let i = 0; i < 4; i++) {
    const date = addDays(TODAY, -30 + i * 7);
    const drop = i === 3 ? 0.9 : 1;
    s.push({ ...session(date, 'Bänkpress', 100 * drop, 5), exercises: [
      { name: 'Bänkpress', sets: [set(100 * drop, 5, 3)], unread: [] },
      { name: 'Knäböj', sets: [set(140 * drop, 5, 3)], unread: [] },
      { name: 'Rodd', sets: [set(80, 8, 3)], unread: [] },
    ] });
  }
  assert.ok(stalling(s, TODAY));
  assert.ok(!stalling(s.slice(0, 3), TODAY));
});
