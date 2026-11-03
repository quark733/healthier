import { addDays, isoWeekdayIndex, type CivilDate } from '../lib/date';

/**
 * Strength training from StrengthLog, as its MCP server's get_sessions tool writes it: plain text
 * meant for an AI assistant to read, not a versioned API. So the parser is strict about what it
 * understands and keeps everything else as it was, marked unread, rather than guessing. A change
 * of format shows as unread sets on the Training page, never as wrong numbers.
 *
 * The text looks like this (weights in kg, warm-up sets left out by StrengthLog):
 *
 *   sessions | 2026-08-11..2026-08-17 | 2 of 6 | kg | warmup sets excluded
 *   format: load x reps x sets | bw = bodyweight | + = added | - = assisted | f = failed rep
 *   max = max reps set | @ = RPE | exercises in the same round are split by a pipe | drop a > b = drop set chain
 *
 *   2026-08-11  Monday evening: legs  62min  bw 80
 *     Squat: 60x5, 80x5, 100x3x3
 *     Pull-Up: bwx8, +10x5x2
 */

export interface StrengthSet {
  /** External load in kg: the bar, the added weight on a pull-up, negative when assisted. Null for bodyweight alone. */
  loadKg: number | null;
  reps: number;
  /** How many sets this line stands for ("100x3x3" is three). */
  count: number;
  /** Bodyweight exercise: the load, if any, is added to or taken off the body. */
  bodyweight: boolean;
  failed: boolean;
  rpe: number | null;
  /** An all-out set for as many reps as possible. */
  max: boolean;
}

export interface StrengthExercise {
  name: string;
  sets: StrengthSet[];
  /** Parts of the line the parser didn't understand, kept as written. */
  unread: string[];
}

export interface StrengthSession {
  date: CivilDate;
  name: string;
  /** Null when StrengthLog gave none, or one too long to be real (a timer left running). */
  durationMin: number | null;
  /** The duration as StrengthLog wrote it, kept so a dropped one can be checked. */
  rawDurationMin: number | null;
  bodyweightKg: number | null;
  exercises: StrengthExercise[];
  /** Lines under the session that weren't an exercise, such as a comment or ratings. */
  notes: string[];
}

export interface ParsedSessions {
  sessions: StrengthSession[];
  /** "2 of 6": how many the reply held, and how many matched. Null when the header is missing. */
  shown: number | null;
  total: number | null;
  /** Whether the weights are in kilograms. Anything else is refused, not converted. */
  kilograms: boolean;
  /** The date range the reply covers, from its header. */
  from: CivilDate | null;
  to: CivilDate | null;
}

/** Longer than this is a timer left running, not a workout. */
export const MAX_SESSION_MIN = 300;

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const SESSION_LINE = new RegExp(String.raw`^(\d{4}-\d{2}-\d{2})\s{2,}(.*?)(?:\s{2,}(\d+)\s*min)?(?:\s{2,}bw\s+(${NUMBER}))?\s*$`);
const SET_TOKEN = new RegExp(
  String.raw`^(bw)?\s*([+-])?\s*(${NUMBER})?\s*x\s*(max\s*)?(\d+)\s*(f)?(?:\s*x\s*(\d+))?(?:\s*@\s*(${NUMBER}))?$`,
  'i',
);

const toNumber = (s: string) => Number(s.replace(',', '.'));

/** One set as written: "100x5", "100x3x3", "bwx8", "+10x5", "-20x6", "60x8@8", "bw x max 12". */
export function parseSet(token: string): StrengthSet | null {
  const m = SET_TOKEN.exec(token.trim());
  if (!m) return null;
  const [, bw, sign, load, max, reps, failed, count, rpe] = m;
  const bodyweight = !!bw || !!sign;
  if (!load && !bodyweight) return null;
  const magnitude = load ? toNumber(load) : null;
  return {
    loadKg: magnitude === null ? null : sign === '-' ? -magnitude : magnitude,
    reps: Number(reps),
    count: count ? Number(count) : 1,
    bodyweight,
    failed: !!failed,
    rpe: rpe ? toNumber(rpe) : null,
    max: !!max,
  };
}

/** "Squat: 60x5, 80x5" or, for a round of several, "Row: 50x10 | Curl: 12x12". */
function parseExerciseLine(line: string): StrengthExercise[] | null {
  const parts = line.split(/\s+\|\s+/);
  const out: StrengthExercise[] = [];
  for (const part of parts) {
    const colon = part.lastIndexOf(': ');
    if (colon <= 0) return null;
    const name = part.slice(0, colon).trim();
    const sets: StrengthSet[] = [];
    const unread: string[] = [];
    for (const token of part.slice(colon + 2).split(/,\s*/)) {
      if (!token.trim()) continue;
      // A drop set chain is several sets in a row.
      for (const piece of token.split(/\s*>\s*/)) {
        const set = parseSet(piece);
        if (set) sets.push(set);
        else unread.push(piece.trim());
      }
    }
    if (!sets.length && !unread.length) return null;
    out.push({ name, sets, unread });
  }
  return out;
}

export function parseSessions(text: string): ParsedSessions {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const result: ParsedSessions = { sessions: [], shown: null, total: null, kilograms: true, from: null, to: null };
  let current: StrengthSession | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    if (line.startsWith('sessions |')) {
      const of = /\|\s*(\d+)\s+of\s+(\d+)\s*\|/.exec(line);
      if (of) {
        result.shown = Number(of[1]);
        result.total = Number(of[2]);
      }
      const range = /(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/.exec(line);
      if (range) {
        result.from = range[1] as CivilDate;
        result.to = range[2] as CivilDate;
      }
      const unit = line.split('|').map((s) => s.trim());
      if (unit.includes('lb') || unit.includes('lbs')) result.kilograms = false;
      continue;
    }

    const session = SESSION_LINE.exec(line);
    if (session && !/^\s/.test(raw)) {
      const [, date, name, minutes, bw] = session;
      const rawDuration = minutes ? Number(minutes) : null;
      current = {
        date: date as CivilDate,
        name: name.trim(),
        rawDurationMin: rawDuration,
        durationMin: rawDuration !== null && rawDuration > 0 && rawDuration <= MAX_SESSION_MIN ? rawDuration : null,
        bodyweightKg: bw ? toNumber(bw) : null,
        exercises: [],
        notes: [],
      };
      result.sessions.push(current);
      continue;
    }

    if (current && /^\s/.test(raw)) {
      const exercises = parseExerciseLine(line.trim());
      if (exercises) current.exercises.push(...exercises);
      else current.notes.push(line.trim());
    }
    // Anything else (the format legend, a closing hint) describes the reply, not a session.
  }
  return result;
}

// ─────────────────────────────────────────────────────────────── arithmetic

/**
 * Estimated one-rep max from a set, by Epley's formula: load × (1 + reps / 30). It's an estimate
 * that holds best for low reps, so only sets of 1 to 10 reps with a load of their own count, and
 * bodyweight sets don't (their load is only what was added).
 */
export function estimatedOneRepMax(set: StrengthSet): number | null {
  if (set.bodyweight || set.loadKg === null || set.loadKg <= 0 || set.reps < 1 || set.reps > 10 || set.failed) return null;
  return set.reps === 1 ? set.loadKg : Math.round(set.loadKg * (1 + set.reps / 30) * 10) / 10;
}

/** Kilograms lifted: load × reps × sets, over sets with a load of their own. */
export function setVolume(set: StrengthSet): number {
  return set.loadKg !== null && set.loadKg > 0 && !set.bodyweight ? set.loadKg * set.reps * set.count : 0;
}

export const exerciseVolume = (e: StrengthExercise) => e.sets.reduce((sum, s) => sum + setVolume(s), 0);
export const sessionVolume = (s: StrengthSession) => s.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0);
export const sessionSets = (s: StrengthSession) => s.exercises.reduce((sum, e) => sum + e.sets.reduce((n, set) => n + set.count, 0), 0);
export const unreadCount = (s: StrengthSession) => s.exercises.reduce((n, e) => n + e.unread.length, 0);

/** The heaviest single and the best estimated one-rep max for an exercise in one session. */
export function bestOf(e: StrengthExercise): { e1rm: number | null; heaviest: number | null } {
  let e1rm: number | null = null;
  let heaviest: number | null = null;
  for (const set of e.sets) {
    const est = estimatedOneRepMax(set);
    if (est !== null && (e1rm === null || est > e1rm)) e1rm = est;
    if (!set.bodyweight && set.loadKg !== null && set.loadKg > 0 && !set.failed && (heaviest === null || set.loadKg > heaviest)) heaviest = set.loadKg;
  }
  return { e1rm, heaviest };
}

/**
 * Stable keys for sessions, so importing the same text twice stores each once. Two sessions with
 * the same date and name are told apart by their order in the reply.
 */
export function sessionKeys(sessions: StrengthSession[]): string[] {
  const seen = new Map<string, number>();
  return sessions.map((s) => {
    const base = `${s.date}|${s.name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}|${n}`;
  });
}

/** Exercise names, most sessions first, for choosing what to chart. */
export function exercisesByFrequency(sessions: StrengthSession[]): { name: string; sessions: number }[] {
  const counts = new Map<string, number>();
  for (const s of sessions) for (const name of new Set(s.exercises.map((e) => e.name))) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].map(([name, n]) => ({ name, sessions: n })).sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** Per session that did the exercise: its best estimated one-rep max and heaviest set, oldest first. */
export function exerciseProgress(sessions: StrengthSession[], name: string): { date: CivilDate; e1rm: number | null; heaviest: number | null }[] {
  return sessions
    .filter((s) => s.exercises.some((e) => e.name === name))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => {
      const bests = s.exercises.filter((e) => e.name === name).map(bestOf);
      const max = (k: 'e1rm' | 'heaviest') => bests.reduce<number | null>((m, b) => (b[k] !== null && (m === null || b[k]! > m) ? b[k] : m), null);
      return { date: s.date, e1rm: max('e1rm'), heaviest: max('heaviest') };
    });
}

/** The exercise to show first: a bench press if there is one, otherwise the most frequent. */
export function defaultExercise(sessions: StrengthSession[]): string | null {
  const ranked = exercisesByFrequency(sessions);
  const bench = ranked.find((e) => /b[äa]nkpress|bench press/i.test(e.name) && !/lutande|incline|hantel|dumbbell/i.test(e.name));
  return bench?.name ?? ranked[0]?.name ?? null;
}

// ──────────────────────────────────────────────────────────── weeks and load

/** The Monday a date's week starts on. */
export const weekStart = (date: CivilDate): CivilDate => addDays(date, -isoWeekdayIndex(date));

export interface WeekTotal {
  /** The Monday. */
  date: CivilDate;
  sessions: number;
  sets: number;
  volumeKg: number;
}

/** Totals per Monday-to-Sunday week, the last `weeks` weeks up to the one holding `today`, oldest first. */
export function weeklyTotals(sessions: StrengthSession[], today: CivilDate, weeks: number): WeekTotal[] {
  const last = weekStart(today);
  const out: WeekTotal[] = [];
  const index = new Map<CivilDate, WeekTotal>();
  for (let i = weeks - 1; i >= 0; i--) {
    const w: WeekTotal = { date: addDays(last, -7 * i), sessions: 0, sets: 0, volumeKg: 0 };
    out.push(w);
    index.set(w.date, w);
  }
  for (const s of sessions) {
    const w = index.get(weekStart(s.date));
    if (!w) continue;
    w.sessions += 1;
    w.sets += sessionSets(s);
    w.volumeKg += sessionVolume(s);
  }
  return out;
}

export interface LoadWindow {
  sessions: number;
  sets: number;
  volumeKg: number;
}

export interface RecentLoad {
  /** The last 7 days, today included. */
  week: LoadWindow;
  /** A week's worth, on average, over the 28 days before those 7. Null without any training in them. */
  usual: LoadWindow | null;
  /** This week's sets against the usual week's: 1 is the same. */
  ratio: number | null;
}

const windowOf = (sessions: StrengthSession[], from: CivilDate, to: CivilDate): LoadWindow => {
  const inside = sessions.filter((s) => s.date >= from && s.date <= to);
  return {
    sessions: inside.length,
    sets: inside.reduce((n, s) => n + sessionSets(s), 0),
    volumeKg: inside.reduce((n, s) => n + sessionVolume(s), 0),
  };
};

/**
 * How hard the last week was against the four before it. Sets are the measure: a hard set is
 * the unit most training research counts volume in, and unlike kilograms it doesn't swing with
 * which exercises a week happened to hold.
 */
export function recentLoad(sessions: StrengthSession[], today: CivilDate): RecentLoad {
  const week = windowOf(sessions, addDays(today, -6), today);
  const before = windowOf(sessions, addDays(today, -34), addDays(today, -7));
  const usual = before.sessions ? { sessions: before.sessions / 4, sets: before.sets / 4, volumeKg: before.volumeKg / 4 } : null;
  return { week, usual, ratio: usual && usual.sets > 0 ? week.sets / usual.sets : null };
}

/** Sets per exercise in the last 7 days against a usual week of the 28 before, most sets first. */
export function setsByExercise(sessions: StrengthSession[], today: CivilDate): { name: string; week: number; usual: number }[] {
  const weekFrom = addDays(today, -6);
  const usualFrom = addDays(today, -34);
  const rows = new Map<string, { week: number; usual: number }>();
  for (const s of sessions) {
    if (s.date < usualFrom || s.date > today) continue;
    for (const e of s.exercises) {
      const n = e.sets.reduce((sum, set) => sum + set.count, 0);
      const row = rows.get(e.name) ?? { week: 0, usual: 0 };
      if (s.date >= weekFrom) row.week += n;
      else row.usual += n / 4;
      rows.set(e.name, row);
    }
  }
  return [...rows.entries()].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.week - a.week || b.usual - a.usual);
}

/** Each exercise's best: the heaviest set and the best estimated one-rep max, with their dates. */
export function personalBests(sessions: StrengthSession[]): { name: string; heaviest: number | null; heaviestOn: CivilDate | null; e1rm: number | null; e1rmOn: CivilDate | null; sessions: number }[] {
  const ranked = exercisesByFrequency(sessions);
  return ranked.map(({ name, sessions: n }) => {
    let heaviest: number | null = null;
    let heaviestOn: CivilDate | null = null;
    let e1rm: number | null = null;
    let e1rmOn: CivilDate | null = null;
    for (const p of exerciseProgress(sessions, name)) {
      if (p.heaviest !== null && (heaviest === null || p.heaviest > heaviest)) [heaviest, heaviestOn] = [p.heaviest, p.date];
      if (p.e1rm !== null && (e1rm === null || p.e1rm > e1rm)) [e1rm, e1rmOn] = [p.e1rm, p.date];
    }
    return { name, heaviest, heaviestOn, e1rm, e1rmOn, sessions: n };
  });
}
