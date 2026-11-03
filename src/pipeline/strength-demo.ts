import { addDays, isoWeekdayIndex, type CivilDate } from '../lib/date';
import type { StrengthExercise, StrengthSession, StrengthSet } from './strength';

/**
 * The demo person's strength training: a year of made-up sessions, three a week on an
 * upper/lower/full split, slowly stronger, with a lighter week now and then and a heavier last
 * fortnight, so the Training page has something to show. Nothing here is a real person's.
 */

const TODAY: CivilDate = '2026-10-12';
const DAYS = 400;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the demo person calls things in StrengthLog: their own data, like a real person's, so not translated. */
const NAME = {
  bench: 'Bench Press', // i18n-ignore: an exercise name in the demo person's log
  row: 'Barbell Row', // i18n-ignore: an exercise name in the demo person's log
  pullUp: 'Pull-Up', // i18n-ignore: an exercise name in the demo person's log
  squat: 'Squat', // i18n-ignore: an exercise name in the demo person's log
  rdl: 'Romanian Deadlift', // i18n-ignore: an exercise name in the demo person's log
  legPress: 'Leg Press', // i18n-ignore: an exercise name in the demo person's log
  deadlift: 'Deadlift', // i18n-ignore: an exercise name in the demo person's log
  press: 'Overhead Press', // i18n-ignore: an exercise name in the demo person's log
  upper: 'Upper body', // i18n-ignore: a session name in the demo person's log
  legs: 'Legs', // i18n-ignore: a session name in the demo person's log
  full: 'Full body', // i18n-ignore: a session name in the demo person's log
} as const;

const plate = (kg: number) => Math.round(kg / 2.5) * 2.5;
const set = (loadKg: number | null, reps: number, count = 1, bodyweight = false): StrengthSet => ({
  loadKg, reps, count, bodyweight, failed: false, rpe: null, max: false,
});

/** Warm up to a top weight, then work sets: "60x8, 80x5, 100x5x3". */
function lift(name: string, top: number, reps: number, workSets: number): StrengthExercise {
  return {
    name,
    sets: [set(plate(top * 0.6), 8), set(plate(top * 0.8), 5), set(plate(top), reps, workSets)],
    unread: [],
  };
}

export function demoStrengthSessions(): StrengthSession[] {
  const r = seeded(20261014);
  const out: StrengthSession[] = [];
  const first = addDays(TODAY, -(DAYS - 1));
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(first, i);
    const wd = isoWeekdayIndex(date);
    if (wd !== 0 && wd !== 2 && wd !== 4) continue; // Monday, Wednesday, Friday
    if (r() < 0.1) continue; // a missed session now and then
    const progress = i / (DAYS - 1);
    const deload = Math.floor(i / 7) % 6 === 5; // every sixth week lighter
    const heavy = i > DAYS - 15;
    const f = (deload ? 0.85 : 1) * (1 + 0.12 * progress) * (1 + (r() - 0.5) * 0.03);
    const sets = deload ? 2 : heavy ? 4 : 3;
    const exercises: StrengthExercise[] =
      wd === 0
        ? [lift(NAME.bench, 82 * f, 5, sets), lift(NAME.row, 70 * f, 8, sets), { name: NAME.pullUp, sets: [set(null, 8, sets, true)], unread: [] }]
        : wd === 2
          ? [lift(NAME.squat, 105 * f, 5, sets), lift(NAME.rdl, 90 * f, 8, sets), lift(NAME.legPress, 160 * f, 10, sets)]
          : [lift(NAME.deadlift, 135 * f, 3, sets), lift(NAME.press, 50 * f, 6, sets), lift(NAME.bench, 75 * f, 8, sets)];
    out.push({
      date,
      name: wd === 0 ? NAME.upper : wd === 2 ? NAME.legs : NAME.full,
      durationMin: Math.round(55 + (r() - 0.5) * 20),
      rawDurationMin: null,
      bodyweightKg: null,
      exercises,
      notes: [],
    });
  }
  return out;
}
