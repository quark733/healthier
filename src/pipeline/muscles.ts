import { addDays, type CivilDate } from '../lib/date';
import type { StrengthSession } from './strength';

/**
 * Weekly hard sets per muscle group, and where they sit against the volume landmarks.
 *
 * Counting. A set counts 1 for the muscles an exercise mainly trains and 0.5 for the ones it
 * trains on the side (bench press: chest 1, triceps and shoulders 0.5). That's the "fractional"
 * count, which predicted muscle growth best in the largest meta-regression of training volume
 * (Pelland et al. 2024: 35 studies on hypertrophy, 66 on strength).
 *
 * Landmarks. MEV, MAV and MRV are the minimum effective, the most productive and the most
 * recoverable volume a week, as Mike Israetel and Renaissance Periodization set them out for each
 * muscle. They're coaching guidelines from experience and the research, for an average trainee,
 * not limits measured for any one person: someone's own MRV can sit well above or below them.
 *
 * Exercise names are StrengthLog's, in Swedish or English, matched loosely. An exercise nothing
 * matches is counted nowhere and listed, so the page can say what it left out.
 */

export type Muscle = 'chest' | 'back' | 'shoulders' | 'quads' | 'hamstrings' | 'biceps' | 'triceps';
export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'biceps', 'triceps'];

/** Sets a week: MEV from, MAV from and to, MRV from (RP's published ranges, lower ends). */
export const LANDMARKS: Record<Muscle, { mev: number; mav: [number, number]; mrv: number }> = {
  chest: { mev: 6, mav: [12, 18], mrv: 20 },
  back: { mev: 8, mav: [14, 20], mrv: 22 },
  shoulders: { mev: 6, mav: [12, 16], mrv: 20 },
  quads: { mev: 6, mav: [12, 18], mrv: 20 },
  hamstrings: { mev: 4, mav: [10, 14], mrv: 16 },
  biceps: { mev: 4, mav: [10, 14], mrv: 16 },
  triceps: { mev: 4, mav: [10, 12], mrv: 14 },
};

type Work = Partial<Record<Muscle, number>>;

/** First match wins, so the specific patterns come before the general ones. */
const RULES: [RegExp, Work][] = [
  // Pressing
  [/smalbänk|close.?grip/i, { triceps: 1, chest: 0.5, shoulders: 0.5 }],
  [/dips/i, { triceps: 1, chest: 0.5 }],
  [/jm press|triceps|tricep|scull|skull|pushdown|dala/i, { triceps: 1 }],
  [/uppåtlut|incline/i, { chest: 1, shoulders: 0.5, triceps: 0.5 }],
  [/bänk|bench|larsen|armhävning|push.?up|liggande hantelpress|dumbbell press/i, { chest: 1, triceps: 0.5, shoulders: 0.5 }],
  // Shoulders (reverse flyes and face pulls are the rear of the shoulder)
  [/omvända|reverse|face ?pull|rear delt/i, { shoulders: 1, back: 0.5 }],
  [/flyes|fly\b|pec deck|crossover/i, { chest: 1 }],
  [/sidolyft|lateral raise/i, { shoulders: 1 }],
  [/ryckrodd|upright/i, { shoulders: 1 }],
  [/press|axelpress|overhead|ohp/i, { shoulders: 1, triceps: 0.5 }],
  // Pulling
  [/curl/i, { biceps: 1 }],
  [/lårcurl|leg curl/i, { hamstrings: 1 }],
  [/rodd|row|latsdrag|pulldown|pull.?up|chins|chin.?up|pullover/i, { back: 1, biceps: 0.5 }],
  // Legs
  [/rumänsk|romanian|raka marklyft|stiff|good ?morning/i, { hamstrings: 1, back: 0.5 }],
  [/marklyft|deadlift/i, { hamstrings: 1, back: 0.5, quads: 0.5 }],
  [/hip thrust|glute/i, { hamstrings: 0.5 }],
  [/benspark|leg extension/i, { quads: 1 }],
  [/böj|squat|benpress|leg press|utfall|lunge|split/i, { quads: 1 }],
];

/** Leg curls say "curl" too, so they're picked out before arm curls. */
function workOf(name: string): Work | null {
  if (/lårcurl|leg curl|hamstring curl/i.test(name)) return { hamstrings: 1 };
  for (const [pattern, work] of RULES) if (pattern.test(name)) return work;
  return null;
}

export interface MuscleWeek {
  muscle: Muscle;
  /** Fractional hard sets in the 7 days. */
  sets: number;
  zone: 'below' | 'productive' | 'high' | 'over';
}

/** Below MEV, from MEV to the top of MAV, from there to MRV, and past MRV. */
export function zoneOf(muscle: Muscle, sets: number): MuscleWeek['zone'] {
  const l = LANDMARKS[muscle];
  if (sets < l.mev) return 'below';
  if (sets <= l.mav[1]) return 'productive';
  if (sets < l.mrv) return 'high';
  return 'over';
}

/** Hard sets per muscle over the 7 days to `today`, and the exercises nothing matched. */
export function setsPerMuscle(sessions: StrengthSession[], today: CivilDate): { week: MuscleWeek[]; uncounted: string[] } {
  const from = addDays(today, -6);
  const totals = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const uncounted = new Set<string>();
  for (const s of sessions) {
    if (s.date < from || s.date > today) continue;
    for (const e of s.exercises) {
      const work = workOf(e.name);
      // A hard set is a work set: warm-ups are already left out by StrengthLog.
      const n = e.sets.reduce((sum, set) => sum + (set.reps > 0 ? set.count : 0), 0);
      if (!work) {
        if (n) uncounted.add(e.name);
        continue;
      }
      for (const [muscle, share] of Object.entries(work) as [Muscle, number][]) totals[muscle] += n * share;
    }
  }
  return {
    week: MUSCLES.map((muscle) => ({ muscle, sets: totals[muscle], zone: zoneOf(muscle, totals[muscle]) })),
    uncounted: [...uncounted].sort(),
  };
}

/** For tests and the page: which muscles an exercise name counts for. */
export const musclesOf = workOf;
