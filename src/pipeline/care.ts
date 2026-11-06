import { addDays, type CivilDate } from '../lib/date';

/**
 * The person's own care plan and their day-to-day health log.
 *
 * Care plan: whether they have a history of blood clots or a clotting tendency, the anticoagulant
 * they take and how often, who to contact, and their own notes. Typed in by them; it changes what
 * the dashboard asks and warns about (supplements, the calf question, the dose buttons).
 *
 * Log: doses taken (morning, evening), and events they tag a day with (ill, injured, travelling,
 * a calf that hurts, a change of medicine, a hard week, a symptom). The tags are what would let
 * patterns be found later: nothing can learn to warn about something it never saw marked.
 *
 * Missed doses: apixaban and the other twice-daily anticoagulants wear off within about a day, so
 * a missed dose leaves a gap in protection. The patient leaflets' rule: take it as soon as you
 * remember, unless it's nearly time for the next one; never two at once to make up.
 */

export interface CarePlan {
  clotHistory: boolean;
  /** The anticoagulant's name as the person writes it, or null for none. */
  anticoagulant: string | null;
  dosesPerDay: 1 | 2 | null;
  /** Mark each dose on Today. Off by default: a pill organiser already does the job for many. */
  trackDoses: boolean;
  contact: string;
  notes: string;
}

export const EMPTY_PLAN: CarePlan = { clotHistory: false, anticoagulant: null, dosesPerDay: null, trackDoses: false, contact: '', notes: '' };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');

export function readCarePlan(raw: unknown): CarePlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = text(o.anticoagulant, 80);
  return {
    clotHistory: o.clotHistory === true,
    anticoagulant: name || null,
    dosesPerDay: name ? (o.dosesPerDay === 1 ? 1 : 2) : null,
    trackDoses: !!name && o.trackDoses === true,
    contact: text(o.contact, 300),
    notes: text(o.notes, 2000),
  };
}

export type DoseSlot = 'morning' | 'evening';
export const EVENT_TAGS = ['sick', 'injury', 'calf', 'travel', 'medicine', 'stress', 'symptom', 'other'] as const;
export type EventTag = (typeof EVENT_TAGS)[number];

export type CareEvent =
  | { id?: string; kind: 'dose'; date: CivilDate; at: string; slot: DoseSlot }
  | { id?: string; kind: 'event'; date: CivilDate; at: string; tag: EventTag; note: string };

const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function readEvent(raw: unknown): CareEvent | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const at = typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  if (!at || !isDate(o.date)) return null;
  const id = typeof o.id === 'string' ? o.id : undefined;
  if (o.kind === 'dose' && (o.slot === 'morning' || o.slot === 'evening')) return { id, kind: 'dose', date: o.date, at, slot: o.slot };
  if (o.kind === 'event' && EVENT_TAGS.includes(o.tag as EventTag)) return { id, kind: 'event', date: o.date, at, tag: o.tag as EventTag, note: text(o.note, 500) };
  return null;
}

export interface DoseStatus {
  morning: CareEvent | null;
  evening: CareEvent | null;
  /** Doses not marked in the 14 days before today, counted only from the first day any was marked. */
  missed: number;
  /** The days counted. */
  days: number;
}

export function doseStatus(events: CareEvent[], plan: CarePlan, today: CivilDate): DoseStatus | null {
  if (!plan.anticoagulant || !plan.trackDoses) return null;
  const doses = events.filter((e): e is Extract<CareEvent, { kind: 'dose' }> => e.kind === 'dose');
  const find = (date: CivilDate, slot: DoseSlot) => doses.find((d) => d.date === date && d.slot === slot) ?? null;
  const first = doses.reduce<CivilDate | null>((m, d) => (!m || d.date < m ? d.date : m), null);
  const slots: DoseSlot[] = plan.dosesPerDay === 1 ? ['morning'] : ['morning', 'evening'];
  let missed = 0;
  let days = 0;
  for (let i = 1; i <= 14; i++) {
    const date = addDays(today, -i);
    if (!first || date < first) break;
    days++;
    for (const s of slots) if (!find(date, s)) missed++;
  }
  return { morning: find(today, 'morning'), evening: plan.dosesPerDay === 1 ? null : find(today, 'evening'), missed, days };
}

/** Yesterday's steps under this is a sitting day: a rule of thumb, not a research threshold. */
export const SITTING_DAY_STEPS = 4000;
