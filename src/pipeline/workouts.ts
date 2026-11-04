import { addDays, civilFromInstant, parseUtcOffsetSeconds, type CivilDate } from '../lib/date';
import { int, num } from './coerce';
import type { DailyRecord, SourceRef, Workout, WorkoutKind } from '../types/health';

/**
 * Workouts from Google Health's `exercise` sessions: whatever a watch or an app wrote, through
 * Apple Health or directly. What a session holds varies with what recorded it: a StrengthLog
 * session reaches Google as a strength workout with a start and an end, and sometimes a name and
 * energy; a watch adds heart rate, and a run adds distance. Each field is kept only when present.
 */

/** Google's exercise types folded into the few kinds the page tells apart. Unknown types count as other. */
export function kindOf(type: unknown): WorkoutKind {
  const t = typeof type === 'string' ? type.toUpperCase() : '';
  if (/STRENGTH|WEIGHT|LIFT|CROSSFIT|CALISTHENIC/.test(t)) return 'strength';
  if (/RUN|JOG|TREADMILL/.test(t)) return 'run';
  if (/WALK|HIK/.test(t)) return 'walk';
  if (/BIK|CYCL|SPINN/.test(t)) return 'bike';
  if (/SWIM/.test(t)) return 'swim';
  if (/HIIT|INTERVAL|AEROBIC|ELLIPTICAL|ROW|STAIR|DANC|BOX|CARDIO|SKI|SKAT/.test(t)) return 'cardio';
  return 'other';
}

/** "1800s" or "1800.5s", as minutes. */
function durationMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Number(m[1]) / 60 : null;
}

/** One exercise session, or null if it has no usable start and end. */
export function parseWorkout(c: any, source?: SourceRef): Workout | null {
  const interval = c?.interval;
  const start = civilFromInstant(interval?.startTime, interval?.startUtcOffset);
  const endMs = Date.parse(interval?.endTime ?? '');
  const startMs = Date.parse(interval?.startTime ?? '');
  if (!start || Number.isNaN(endMs) || Number.isNaN(startMs) || endMs <= startMs) return null;
  const span = (endMs - startMs) / 60_000;
  // A session left running for a day isn't a workout anyone did.
  if (span > 600) return null;
  const active = durationMinutes(c?.activeDuration);
  const m = c?.metricsSummary ?? {};
  const kcal = num(m.caloriesKcal);
  const hr = int(m.averageHeartRateBeatsPerMinute);
  const mm = num(m.distanceMillimeters);
  const name = typeof c?.displayName === 'string' && c.displayName.trim() ? c.displayName.trim() : null;
  return {
    startIso: interval.startTime,
    startMinute: start.minutesOfDay,
    offsetSeconds: parseUtcOffsetSeconds(interval?.startUtcOffset),
    endIso: interval.endTime,
    type: typeof c?.exerciseType === 'string' ? c.exerciseType : 'UNKNOWN',
    kind: kindOf(c?.exerciseType),
    name,
    minutes: Math.round(active !== null && active > 0 && active <= span ? active : span),
    kcal: kcal !== null && kcal > 0 ? Math.round(kcal) : null,
    avgHr: hr !== null && hr > 30 && hr < 230 ? hr : null,
    distanceKm: mm !== null && mm > 0 ? Math.round(mm / 10_000) / 100 : null,
    source: source?.label ?? null,
  };
}

/** Whether two sessions are the same one recorded twice: they overlap for most of the shorter one. */
export function sameSession(a: Workout, b: Workout): boolean {
  const s = Math.max(Date.parse(a.startIso), Date.parse(b.startIso));
  const e = Math.min(Date.parse(a.endIso), Date.parse(b.endIso));
  const shorter = Math.min(Date.parse(a.endIso) - Date.parse(a.startIso), Date.parse(b.endIso) - Date.parse(b.startIso));
  return e > s && shorter > 0 && (e - s) / shorter >= 0.5;
}

export interface DatedWorkout extends Workout {
  date: CivilDate;
}

/** The workouts in the days from `from` to `to`, oldest first. */
export function workoutsBetween(days: DailyRecord[], from: CivilDate, to: CivilDate): DatedWorkout[] {
  return days
    .filter((d) => d.date >= from && d.date <= to)
    .flatMap((d) => (d.workouts ?? []).map((w) => ({ ...w, date: d.date })))
    .sort((a, b) => a.startIso.localeCompare(b.startIso));
}

export interface WorkoutWeek {
  sessions: number;
  strength: number;
  /** Minutes of everything but strength. */
  cardioMinutes: number;
  kcal: number;
}

/** The 7 days to `today`. */
export function workoutWeek(days: DailyRecord[], today: CivilDate): WorkoutWeek {
  const list = workoutsBetween(days, addDays(today, -6), today);
  return {
    sessions: list.length,
    strength: list.filter((w) => w.kind === 'strength').length,
    cardioMinutes: list.filter((w) => w.kind !== 'strength').reduce((s, w) => s + w.minutes, 0),
    kcal: list.reduce((s, w) => s + (w.kcal ?? 0), 0),
  };
}
