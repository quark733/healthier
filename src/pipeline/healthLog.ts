import type { CivilDate } from '../lib/date';

/**
 * The health log: days tagged with what happened (ill, injured, travelling, a change of medicine,
 * a hard week, a symptom). The tags are what would let patterns be found later: illness and
 * stress show in pulse and HRV, injuries in training, and nothing can learn to warn about
 * something that was never marked.
 */

export const LOG_TAGS = ['sick', 'injury', 'travel', 'medicine', 'stress', 'symptom', 'other'] as const;
export type LogTag = (typeof LOG_TAGS)[number];

export interface LogEntry {
  id?: string;
  date: CivilDate;
  at: string;
  tag: LogTag;
  note: string;
}

const isDate = (v: unknown): v is CivilDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function readLogEntry(raw: unknown): LogEntry | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const at = typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  if (!at || !isDate(o.date) || !LOG_TAGS.includes(o.tag as LogTag)) return null;
  return {
    id: typeof o.id === 'string' ? o.id : undefined,
    date: o.date,
    at,
    tag: o.tag as LogTag,
    note: typeof o.note === 'string' ? o.note.slice(0, 500).trim() : '',
  };
}
