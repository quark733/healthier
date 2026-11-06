import { addDays, type CivilDate } from '../lib/date';

/**
 * The morning check-in: five questions answered 1 to 5 before the day starts, the short wellness
 * questionnaire used across team sport (McLean et al. 2010): sleep quality, fatigue, muscle
 * soreness, stress and mood, where 5 is best. Self-reported wellbeing follows training load more
 * closely than most objective markers (Saw et al. 2016, 56 studies), and it covers nights the watch
 * wasn't worn. It complements the watch's numbers; it doesn't replace them.
 */
export const CHECKIN_ITEMS = ['sleep', 'fatigue', 'soreness', 'stress', 'mood'] as const;
export type CheckinItem = (typeof CHECKIN_ITEMS)[number];

export type Checkin = Record<CheckinItem, number> & {
  date: CivilDate;
  /** Coffee, an energy drink or pre-workout within about 6 hours of going to bed the evening before. */
  lateCaffeine?: boolean;
};

const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** A check-in as sent or stored, or null if any answer is missing or out of 1–5. */
export function readCheckin(raw: unknown): Checkin | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!isDate(o.date)) return null;
  const out = { date: o.date } as Checkin;
  for (const k of CHECKIN_ITEMS) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return null;
    out[k] = v;
  }
  if (typeof o.lateCaffeine === 'boolean') out.lateCaffeine = o.lateCaffeine;
  return out;
}

export interface CaffeineEffect {
  /** Mornings after late caffeine, and after none. */
  withN: number;
  withoutN: number;
  /** Self-rated sleep quality, 1–5, on each. */
  ratingWith: number;
  ratingWithout: number;
  /** Minutes asleep from the watch, when it was worn on at least 3 nights of each. */
  minutesWith: number | null;
  minutesWithout: number | null;
}

/**
 * The person's own sleep after evenings with late caffeine against evenings without, over the
 * last 60 days, once there are 4 or more mornings of each. Caffeine 6 hours before bed cut sleep by
 * more than an hour in a controlled trial (Drake et al. 2013); this shows what it does for them.
 */
export function caffeineEffect(list: Checkin[], minutesAsleep: (date: CivilDate) => number | null, today: CivilDate): CaffeineEffect | null {
  const recent = list.filter((c) => c.lateCaffeine !== undefined && c.date > addDays(today, -60) && c.date <= today);
  const yes = recent.filter((c) => c.lateCaffeine);
  const no = recent.filter((c) => !c.lateCaffeine);
  if (yes.length < 4 || no.length < 4) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mins = (cs: Checkin[]) => {
    const m = cs.map((c) => minutesAsleep(c.date)).filter((v): v is number => v !== null);
    return m.length >= 3 ? avg(m) : null;
  };
  const minutesWith = mins(yes);
  const minutesWithout = mins(no);
  return {
    withN: yes.length,
    withoutN: no.length,
    ratingWith: avg(yes.map((c) => c.sleep)),
    ratingWithout: avg(no.map((c) => c.sleep)),
    minutesWith: minutesWith !== null && minutesWithout !== null ? minutesWith : null,
    minutesWithout: minutesWith !== null && minutesWithout !== null ? minutesWithout : null,
  };
}

export const checkinTotal = (c: Checkin) => CHECKIN_ITEMS.reduce((s, k) => s + c[k], 0);

export interface CheckinVerdict {
  total: number;
  /** The person's usual total over the 28 days before, when there are at least 7 check-ins. */
  usual: number | null;
  /** Items at 1 or 2: the ones to act on. */
  low: CheckinItem[];
  /** Low enough to take a step off today's dose: an item at 1, two at 2 or less, or 4+ under usual. */
  lower: boolean;
}

/** Today's check-in against the person's own usual. */
export function judgeCheckin(list: Checkin[], today: CivilDate): CheckinVerdict | null {
  const now = list.find((c) => c.date === today);
  if (!now) return null;
  const before = list.filter((c) => c.date < today && c.date >= addDays(today, -28)).map(checkinTotal);
  const usual = before.length >= 7 ? before.reduce((a, b) => a + b, 0) / before.length : null;
  const total = checkinTotal(now);
  const low = CHECKIN_ITEMS.filter((k) => now[k] <= 2);
  const lower = CHECKIN_ITEMS.some((k) => now[k] === 1) || low.length >= 2 || (usual !== null && usual - total >= 4);
  return { total, usual, low, lower };
}
