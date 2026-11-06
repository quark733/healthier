import { addDays, type CivilDate } from '../lib/date';

/**
 * Measurements the person takes by hand: blood pressure at home and waist circumference.
 *
 * Blood pressure. Home readings, seated after 5 minutes' rest, arm at heart height, two readings a
 * minute apart; the European Society of Hypertension's home protocol is morning and evening for 7
 * days, the first day left out, and a home average of 135/85 or more is high (ESH 2023 guidelines).
 * Weight loss lowers it, by about 1 mmHg per kilogram lost in trials.
 *
 * Waist. Measured standing, in the morning, at the navel. Waist-to-height under 0.5 is the
 * healthy range; 0.5 to 0.59 is increased risk and 0.6 or more high (NICE 2022). It follows belly
 * fat more directly than a scale's body-fat reading.
 */

export type Measurement =
  | { id?: string; kind: 'bp'; at: string; date: CivilDate; sys: number; dia: number; pulse: number | null }
  | { id?: string; kind: 'waist'; at: string; date: CivilDate; cm: number };

export type BloodPressure = Extract<Measurement, { kind: 'bp' }>;
export type Waist = Extract<Measurement, { kind: 'waist' }>;

const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);

/** A measurement as sent or stored, or null if anything is missing or implausible. */
export function readMeasurement(raw: unknown): Measurement | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const at = typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  if (!at || !isDate(o.date)) return null;
  const id = typeof o.id === 'string' ? o.id : undefined;
  if (o.kind === 'bp') {
    const sys = int(o.sys, 60, 260);
    const dia = int(o.dia, 30, 160);
    if (sys === null || dia === null || dia >= sys) return null;
    const pulse = o.pulse === null || o.pulse === undefined ? null : int(o.pulse, 25, 220);
    return { id, kind: 'bp', at, date: o.date, sys, dia, pulse };
  }
  if (o.kind === 'waist') {
    const cm = typeof o.cm === 'number' && o.cm >= 40 && o.cm <= 250 ? Math.round(o.cm * 10) / 10 : null;
    return cm === null ? null : { id, kind: 'waist', at, date: o.date, cm };
  }
  return null;
}

/** The ESH line for a home average. */
export const HOME_BP_HIGH = { sys: 135, dia: 85 } as const;

export interface BpSummary {
  /** Readings in the last 7 days (leaving out the first day of the week when there are more days). */
  n: number;
  sys: number;
  dia: number;
  pulse: number | null;
  high: boolean;
  /** The 7-day average 4 weeks before, to show the trend, when there were readings then. */
  before: { sys: number; dia: number } | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function average(list: BloodPressure[]) {
  const pulses = list.map((m) => m.pulse).filter((p): p is number => p !== null);
  return { sys: mean(list.map((m) => m.sys)), dia: mean(list.map((m) => m.dia)), pulse: pulses.length ? mean(pulses) : null };
}

export function bpSummary(all: Measurement[], today: CivilDate): BpSummary | null {
  const bp = all.filter((m): m is BloodPressure => m.kind === 'bp');
  const week = bp.filter((m) => m.date > addDays(today, -7) && m.date <= today);
  if (!week.length) return null;
  // ESH leaves out the first day of a measuring week: readings are higher before one gets used to it.
  const days = [...new Set(week.map((m) => m.date))].sort();
  const used = days.length >= 4 ? week.filter((m) => m.date !== days[0]) : week;
  const a = average(used);
  const earlier = bp.filter((m) => m.date > addDays(today, -35) && m.date <= addDays(today, -28));
  return {
    n: used.length,
    sys: a.sys,
    dia: a.dia,
    pulse: a.pulse,
    high: a.sys >= HOME_BP_HIGH.sys || a.dia >= HOME_BP_HIGH.dia,
    before: earlier.length ? (({ sys, dia }) => ({ sys, dia }))(average(earlier)) : null,
  };
}

export interface WaistSummary {
  latest: Waist;
  /** Change since the reading closest to 4 weeks before, in cm (negative is smaller). */
  change4w: number | null;
  ratio: number | null;
  band: 'healthy' | 'increased' | 'high' | null;
}

export function waistSummary(all: Measurement[], heightCm: number | null, today: CivilDate): WaistSummary | null {
  const waists = all.filter((m): m is Waist => m.kind === 'waist' && m.date <= today).sort((a, b) => (a.at < b.at ? -1 : 1));
  const latest = waists.at(-1);
  if (!latest) return null;
  const target = addDays(latest.date, -28);
  const earlier = waists.filter((w) => w.date <= addDays(latest.date, -21));
  const ref = earlier.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(target)) - Math.abs(Date.parse(b.date) - Date.parse(target)))[0];
  const ratio = heightCm ? latest.cm / heightCm : null;
  return {
    latest,
    change4w: ref ? latest.cm - ref.cm : null,
    ratio,
    band: ratio === null ? null : ratio < 0.5 ? 'healthy' : ratio < 0.6 ? 'increased' : 'high',
  };
}
