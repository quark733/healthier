import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestOf, defaultExercise, estimatedOneRepMax, exerciseProgress, parseSessions, parseSet, personalBests, recentLoad, sessionSets,
  sessionVolume, setsByExercise, unreadCount, weekStart, weeklyTotals,
} from '../strength';

// Made-up sessions in the shape StrengthLog's get_sessions writes. No real person's training.
const REPLY = `sessions | 2026-09-01..2026-09-08 | 3 of 9 | kg | warmup sets excluded
format: load x reps x sets | bw = bodyweight | + = added | - = assisted | f = failed rep
max = max reps set | @ = RPE | exercises in the same round are split by a pipe | drop a > b = drop set chain

2026-09-01  Monday: push  58min  bw 82.5
  Bench Press: 60x8, 80x5, 100x3x3, 90x6f
  Incline Dumbbell Press: 28x10, 30x8x2

2026-09-04  Thursday: pull, back  4312min  bw 82
  Pull-Up: bwx8, +10x5x2, -15x10
  Barbell Row: 70x8 > 50x10 | Biceps Curl: 14x12@8
  felt strong today

2026-09-08  Monday: push  61min
  Bench Press: 60x8, 85x5, 102.5x2x2, 105x1
  Dips: bw x max 14, something new

showing the 3 most recent of 9 sessions. narrow the date range, or use get_summary for longer periods.`;

describe('StrengthLog sessions', () => {
  const parsed = parseSessions(REPLY);

  it('reads the header and every session, oldest first as written', () => {
    assert.equal(parsed.shown, 3);
    assert.equal(parsed.total, 9);
    assert.equal(parsed.kilograms, true);
    assert.deepEqual([parsed.from, parsed.to], ['2026-09-01', '2026-09-08']);
    assert.deepEqual(parsed.sessions.map((s) => s.date), ['2026-09-01', '2026-09-04', '2026-09-08']);
    assert.equal(parsed.sessions[0].name, 'Monday: push');
    assert.equal(parsed.sessions[0].bodyweightKg, 82.5);
    assert.equal(parsed.sessions[2].bodyweightKg, null);
  });

  it('keeps a believable duration and drops a timer left running', () => {
    assert.equal(parsed.sessions[0].durationMin, 58);
    assert.equal(parsed.sessions[1].durationMin, null);
    assert.equal(parsed.sessions[1].rawDurationMin, 4312);
  });

  it('reads loads, reps, repeated sets, bodyweight, assistance, failures, RPE, rounds and drop sets', () => {
    const [push, pull] = parsed.sessions;
    assert.deepEqual(push.exercises.map((e) => e.name), ['Bench Press', 'Incline Dumbbell Press']);
    assert.deepEqual(push.exercises[0].sets[2], { loadKg: 100, reps: 3, count: 3, bodyweight: false, failed: false, rpe: null, max: false });
    assert.equal(push.exercises[0].sets[3].failed, true);
    const pullUp = pull.exercises[0].sets;
    assert.deepEqual(pullUp.map((s) => [s.bodyweight, s.loadKg, s.reps, s.count]), [[true, null, 8, 1], [true, 10, 5, 2], [true, -15, 10, 1]]);
    assert.deepEqual(pull.exercises.map((e) => e.name), ['Pull-Up', 'Barbell Row', 'Biceps Curl']);
    assert.deepEqual(pull.exercises[1].sets.map((s) => s.loadKg), [70, 50]);
    assert.equal(pull.exercises[2].sets[0].rpe, 8);
    assert.deepEqual(pull.notes, ['felt strong today']);
  });

  it('keeps what it does not understand, marked unread, instead of guessing', () => {
    const dips = parsed.sessions[2].exercises[1];
    assert.equal(dips.sets[0].max, true);
    assert.equal(dips.sets[0].reps, 14);
    assert.deepEqual(dips.unread, ['something new']);
    assert.equal(unreadCount(parsed.sessions[2]), 1);
  });

  it('adds up volume from sets with a load of their own', () => {
    // 60·8 + 80·5 + 100·3·3 + 90·6 + 28·10 + 30·8·2
    assert.equal(sessionVolume(parsed.sessions[0]), 480 + 400 + 900 + 540 + 280 + 480);
    assert.equal(sessionSets(parsed.sessions[0]), 1 + 1 + 3 + 1 + 1 + 2);
  });

  it('estimates a one-rep max by Epley, from 1 to 10 clean reps only', () => {
    assert.equal(estimatedOneRepMax(parseSet('105x1')!), 105);
    assert.equal(Math.round(estimatedOneRepMax(parseSet('100x3')!)! * 10) / 10, 110);
    assert.equal(estimatedOneRepMax(parseSet('60x12')!), null);
    assert.equal(estimatedOneRepMax(parseSet('90x6f')!), null);
    assert.equal(estimatedOneRepMax(parseSet('+10x5')!), null);
    assert.deepEqual(bestOf(parsed.sessions[0].exercises[0]), { e1rm: 110, heaviest: 100 });
  });

  it('follows one exercise across sessions and picks a bench press to show first', () => {
    assert.equal(defaultExercise(parsed.sessions), 'Bench Press');
    assert.deepEqual(exerciseProgress(parsed.sessions, 'Bench Press').map((p) => [p.date, p.heaviest]), [['2026-09-01', 100], ['2026-09-08', 105]]);
  });

  it('refuses weights in pounds rather than converting them', () => {
    assert.equal(parseSessions('sessions | 2026-09-01..2026-09-08 | 1 of 1 | lb | warmup sets excluded').kilograms, false);
  });

  it('reads an empty range as no sessions', () => {
    assert.deepEqual(parseSessions('no sessions in range').sessions, []);
  });
});

describe('strength load over weeks', () => {
  const { sessions } = parseSessions(REPLY);

  it('adds sessions into Monday-to-Sunday weeks, empty weeks included', () => {
    assert.equal(weekStart('2026-09-06'), '2026-08-31');
    const weeks = weeklyTotals(sessions, '2026-09-10', 3);
    assert.deepEqual(weeks.map((w) => [w.date, w.sessions]), [['2026-08-24', 0], ['2026-08-31', 2], ['2026-09-07', 1]]);
    assert.equal(weeks[1].volumeKg, sessionVolume(sessions[0]) + sessionVolume(sessions[1]));
  });

  it('compares the last 7 days with a usual week of the 28 before', () => {
    const load = recentLoad(sessions, '2026-09-10');
    assert.equal(load.week.sessions, 2);
    assert.equal(load.usual!.sessions, 0.25);
    assert.equal(load.ratio, load.week.sets / load.usual!.sets);
    assert.equal(recentLoad(sessions, '2026-09-04').usual, null);
  });

  it('counts sets per exercise and finds each one’s best', () => {
    const rows = setsByExercise(sessions, '2026-09-10');
    assert.deepEqual(rows.find((r) => r.name === 'Bench Press'), { name: 'Bench Press', week: 5, usual: 1.5 });
    const bench = personalBests(sessions).find((b) => b.name === 'Bench Press')!;
    assert.deepEqual([bench.heaviest, bench.heaviestOn, bench.sessions], [105, '2026-09-08', 2]);
  });
});
