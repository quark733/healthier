import type { CivilDate } from '../lib/date';
import type { Gender } from './registry';

/**
 * Blood test results: read from the text of a lab report (or simple lines), matched to a known
 * marker where possible, and judged against the lab's own reference range and, for a few markers,
 * against a goal from a named guideline.
 *
 * A reference range is where 95% of healthy people land; one value outside it is a reason to look
 * again, not a diagnosis, and a value inside it isn't automatically the best one for a goal. Where
 * a guideline sets a goal tighter than the range (LDL, ApoB, vitamin D, CRP, Lp(a)), the goal and
 * its source are shown beside the range.
 *
 * Nothing here is medical advice: the page says to talk to a doctor about values outside the range.
 */

export type BloodGroup = 'count' | 'metabolic' | 'lipids' | 'liver' | 'kidney' | 'inflammation' | 'hormones' | 'thyroid' | 'vitamins';
export const BLOOD_GROUPS: BloodGroup[] = ['lipids', 'metabolic', 'count', 'vitamins', 'hormones', 'thyroid', 'inflammation', 'liver', 'kidney'];

export interface Marker {
  id: string;
  group: BloodGroup;
  /** Matched against the lab's name for it, Swedish or English. */
  match: RegExp;
  /** For men, when the lab gives the range only in a comment by sex and age (adults under 50). */
  maleRange?: [number | null, number | null];
  femaleRange?: [number | null, number | null];
  /** A goal tighter than the reference range, from a named guideline (its words are in the language file). */
  goal?: { below?: number; above?: number };
  /** The unit the goal is in; a result in another unit is judged by the range alone. */
  goalUnit?: RegExp;
}

/**
 * The markers the page knows. Order inside a group is the order on the page. The first match wins,
 * so the specific names come before the general ones (bioactive testosterone before testosterone).
 */
export const MARKERS: Marker[] = [
  // Lipids: the ones that carry cardiovascular risk come first.
  { id: 'apob', group: 'lipids', match: /apo(lipoprotein)?\s*b(?!\s*\/)\b(?!.*a1)/i, goal: { below: 1.0 } },
  { id: 'ldl', group: 'lipids', match: /^(?:[a-z]{1,3}-)?ldl[\s-]*(kolesterol|cholesterol)|ldl\s+direkt/i, goal: { below: 3.0 } },
  { id: 'nonHdl', group: 'lipids', match: /non-?hdl/i, goal: { below: 3.8 } },
  { id: 'lpa', group: 'lipids', match: /\blp\s*\(a\)|lipoprotein\s*\(a\)/i, goal: { below: 75 }, goalUnit: /nmol/i },
  { id: 'tg', group: 'lipids', match: /triglycerid/i, goal: { below: 1.7 } },
  { id: 'hdl', group: 'lipids', match: /^(?:[a-z]{1,3}-)?hdl[\s-]*(kolesterol|cholesterol)/i },
  { id: 'chol', group: 'lipids', match: /^(?:[a-z]{1,3}-)?(kolesterol|cholesterol|total cholesterol)$/i },
  { id: 'apobA1', group: 'lipids', match: /apo\s*b\s*\/\s*apo\s*a1/i },
  { id: 'apoa1', group: 'lipids', match: /apo(lipoprotein)?\s*a1/i },
  { id: 'ldlHdl', group: 'lipids', match: /ldl\s*\/\s*hdl/i },
  // Blood sugar
  { id: 'glucose', group: 'metabolic', match: /glukos|glucose/i, goal: { below: 5.6 } },
  { id: 'hba1c', group: 'metabolic', match: /hba1c/i, goal: { below: 39 } },
  { id: 'insulin', group: 'metabolic', match: /insulin/i },
  { id: 'cpeptide', group: 'metabolic', match: /c-?peptid/i },
  // Blood count
  { id: 'hb', group: 'count', match: /hemoglobin|haemoglobin|^b-hb$/i },
  { id: 'hct', group: 'count', match: /\bevf\b|hematokrit|haematocrit|hematocrit/i },
  { id: 'rbc', group: 'count', match: /erytrocyter$|erythrocytes|red blood cells/i },
  { id: 'mcv', group: 'count', match: /mcv/i },
  { id: 'mch', group: 'count', match: /\bmch\b(?!c)/i },
  { id: 'mchc', group: 'count', match: /mchc/i },
  { id: 'wbc', group: 'count', match: /leukocyter|leukocytes|white blood/i },
  { id: 'neutrophils', group: 'count', match: /neutrofil|neutrophil/i },
  { id: 'lymphocytes', group: 'count', match: /lymfocyt|lymphocyt/i },
  { id: 'monocytes', group: 'count', match: /monocyt/i },
  { id: 'eosinophils', group: 'count', match: /eosinofil|eosinophil/i },
  { id: 'basophils', group: 'count', match: /basofil|basophil/i },
  { id: 'platelets', group: 'count', match: /trombocyt|platelet/i },
  // Vitamins, iron and minerals
  { id: 'vitD', group: 'vitamins', match: /vitamin\s*d|25-oh/i, goal: { above: 75 } },
  { id: 'ferritin', group: 'vitamins', match: /ferritin/i },
  { id: 'iron', group: 'vitamins', match: /^(?:[a-z]{1,3}-)?(järn|iron)$/i },
  { id: 'transferrinSat', group: 'vitamins', match: /transferrinmättnad|transferrin saturation|järnmättnad/i },
  { id: 'b12', group: 'vitamins', match: /kobalamin|cobalamin|b12/i },
  { id: 'folate', group: 'vitamins', match: /folat|folate/i },
  { id: 'magnesium', group: 'vitamins', match: /magnesium/i },
  // Hormones
  { id: 'testosteroneBio', group: 'hormones', match: /testosteron.*bioaktiv|bioavailable testosterone|bioactive testosterone/i },
  { id: 'tShbg', group: 'hormones', match: /testosteron\s*\/\s*shbg|free androgen|testosterone\s*\/\s*shbg/i, maleRange: [0.45, null], femaleRange: [null, 0.06] },
  { id: 'testosterone', group: 'hormones', match: /testosteron/i, maleRange: [8.3, 30], femaleRange: [0.48, 1.9] },
  { id: 'shbg', group: 'hormones', match: /shbg/i, maleRange: [15, 70], femaleRange: [40, 115] },
  { id: 'lh', group: 'hormones', match: /^(?:[a-z]{1,3}-)?lh$|luteinizing/i, maleRange: [null, 9] },
  { id: 'prolactin', group: 'hormones', match: /prolaktin|prolactin/i, maleRange: [64, 403], femaleRange: [64, 572] },
  { id: 'igf1', group: 'hormones', match: /igf-?1/i },
  { id: 'dheas', group: 'hormones', match: /dheas|dehydroepiandrosteron/i },
  { id: 'cortisol', group: 'hormones', match: /kortisol|cortisol/i },
  // Thyroid
  { id: 'tsh', group: 'thyroid', match: /tsh|tyreotropin|thyrotropin/i },
  { id: 'ft4', group: 'thyroid', match: /fritt\s*t4|free\s*t4|ft4/i },
  { id: 'ft3', group: 'thyroid', match: /fritt\s*t3|free\s*t3|ft3/i },
  // Inflammation and clotting
  { id: 'crp', group: 'inflammation', match: /crp/i, goal: { below: 1 } },
  { id: 'ddimer', group: 'inflammation', match: /d-?dimer/i },
  // Liver
  { id: 'alt', group: 'liver', match: /alat|\balt\b/i },
  { id: 'ast', group: 'liver', match: /asat|\bast\b/i },
  { id: 'ggt', group: 'liver', match: /gamma-?gt|\bggt\b/i },
  { id: 'alp', group: 'liver', match: /\balp\b|alkalisk fosfatas|alkaline phosphatase/i },
  { id: 'bilirubin', group: 'liver', match: /bilirubin/i },
  { id: 'albumin', group: 'liver', match: /albumin/i },
  // Kidney and muscle
  { id: 'cystatinC', group: 'kidney', match: /cystatin/i },
  { id: 'egfrCys', group: 'kidney', match: /egfr.*cyst/i },
  { id: 'egfrCrea', group: 'kidney', match: /egfr.*krea|egfr.*creat/i },
  { id: 'egfr', group: 'kidney', match: /egfr/i },
  { id: 'creatinine', group: 'kidney', match: /kreatinin|creatinine/i },
  { id: 'ck', group: 'kidney', match: /^(?:[a-z]{1,3}-)?ck$|kreatinkinas|creatine kinase/i },
];

/** The marker a lab's name for a result stands for, or null. eGFR and cystatin come before creatinine. */
export function markerFor(name: string): Marker | null {
  // 1177 writes "P—Glukos" with a long dash; urine results ("U-Glukos (remsa)") are not blood markers.
  const n = name.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
  if (/^u-|\(remsa\)/i.test(n)) return null;
  // eGFR names also say "krea" and "CystC": they're eGFR, not the markers they're computed from.
  const ordered = /egfr/i.test(n) ? MARKERS.filter((m) => m.id.startsWith('egfr')) : MARKERS.filter((m) => !m.id.startsWith('egfr'));
  return ordered.find((m) => m.match.test(n)) ?? null;
}

export interface LabResult {
  date: CivilDate;
  /** The lab's own name for it, as written. */
  name: string;
  /** The matched marker, or null for one the page doesn't know (shown under "Other"). */
  marker: string | null;
  value: number;
  /** "<0.27" and ">90" are bounds, not exact values. */
  cmp: '<' | '>' | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const toNum = (s: string) => Number(s.replace(',', '.'));
/** Units as labs write them: anything with a slash, or one of the bare ones. */
const UNIT = /^(?:\S*\/\S*|pg|fL|fl|%|g|mg|U|E|kE|mE|IE|mIE|mmol|µmol|umol|nmol|pmol)$/;
const ROW = new RegExp(String.raw`^(.*?)\s+([<>]?\s?${NUM})(?:\s+((?:[<>]\s?${NUM})|(?:${NUM}\s*[-–]\s*${NUM})))?\s+(\d{4}-\d{2}-\d{2})(?:\s+\d{1,2}:\d{2})?\s*$`);

function rangeOf(text: string | undefined): [number | null, number | null] {
  if (!text) return [null, null];
  const t = text.replace(/\s/g, '');
  const span = t.match(new RegExp(String.raw`^(${NUM})[-–](${NUM})$`));
  if (span) return [toNum(span[1]), toNum(span[2])];
  const below = t.match(new RegExp(String.raw`^<(${NUM})$`));
  if (below) return [null, toNum(below[1])];
  const above = t.match(new RegExp(String.raw`^>(${NUM})$`));
  if (above) return [toNum(above[1]), null];
  return [null, null];
}

function valueOf(text: string): { value: number; cmp: LabResult['cmp'] } {
  const t = text.replace(/\s/g, '');
  const cmp = t.startsWith('<') ? '<' : t.startsWith('>') ? '>' : null;
  return { value: toNum(cmp ? t.slice(1) : t), cmp };
}

/** One row of a report: "S-Kolesterol mmol/L 5.7 2.9 - 6.1 2025-11-17 16:14". */
function parseRow(line: string): LabResult | null {
  const m = line.match(ROW);
  if (!m) return null;
  let head = m[1].trim();
  let unit: string | null = null;
  const tokens = head.split(' ');
  if (tokens.length > 1 && UNIT.test(tokens[tokens.length - 1])) {
    unit = tokens.pop()!;
    head = tokens.join(' ');
  }
  head = head.replace(/,$/, '');
  const { value, cmp } = valueOf(m[2]);
  if (!Number.isFinite(value) || !head) return null;
  const [refLow, refHigh] = rangeOf(m[3]);
  return { date: m[4] as CivilDate, name: head, marker: markerFor(head)?.id ?? null, value, cmp, unit, refLow, refHigh };
}

/** One simple line: "2025-11-17; S-Kolesterol; 5.7; mmol/L; 2.9-6.1". */
function parseSimple(line: string): LabResult | null {
  const parts = line.split(/[;\t]/).map((p) => p.trim());
  if (parts.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null;
  const [date, name, raw, unit, ref] = parts;
  const { value, cmp } = valueOf(raw);
  if (!name || !Number.isFinite(value)) return null;
  const [refLow, refHigh] = rangeOf(ref);
  return { date: date as CivilDate, name, marker: markerFor(name)?.id ?? null, value, cmp, unit: unit || null, refLow, refHigh };
}

export interface ParsedLabs {
  results: LabResult[];
  /** Lines that looked like a result but couldn't be read. */
  unread: string[];
}

/**
 * Results from pasted text: the text of a lab report (rows ending in a date, as SYNLAB, Unilabs and
 * Werlabs print them, with names that wrap onto a second line joined back up), or simple lines of
 * date; name; value; unit; range. Comment lines and "see answer" rows are left out.
 */
export function parseLabText(text: string): ParsedLabs {
  const results: LabResult[] = [];
  const unread: string[] = [];
  let carry = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^kommentar|^comment/i.test(line)) {
      carry = '';
      continue;
    }
    const simple = parseSimple(line);
    if (simple) {
      results.push(simple);
      continue;
    }
    const row = parseRow(carry ? `${carry} ${line}` : line);
    if (row) {
      results.push(row);
      carry = '';
      continue;
    }
    // A name that wrapped ("S-DHEAS," then "Dehydroepiandrosteronsulfat") carries to the next line;
    // comment text (it has a colon) and "see answer" rows don't.
    if (/se svar|see result/i.test(line) || line.includes(':')) {
      carry = '';
      continue;
    }
    if (carry || /^(\(?[a-z]{1,3}\)?-|[a-z]{1,3}\([a-z]+\)-)/i.test(line) || line.endsWith(',')) {
      carry = carry ? `${carry} ${line}` : line;
      if (/\d{4}-\d{2}-\d{2}/.test(line)) {
        unread.push(carry);
        carry = '';
      }
    }
  }
  return { results, unread };
}

export type Status = 'low' | 'high' | 'watch' | 'ok' | 'unknown';

/** The range to judge a result by: the lab's own, else the one its comment gives for the person's sex. */
export function rangeFor(r: LabResult, gender: Gender | null): [number | null, number | null] {
  if (r.refLow !== null || r.refHigh !== null) return [r.refLow, r.refHigh];
  const m = MARKERS.find((x) => x.id === r.marker);
  if (gender === 'male' && m?.maleRange) return m.maleRange;
  if (gender === 'female' && m?.femaleRange) return m.femaleRange;
  return [null, null];
}

/** Outside the range is low or high; inside it but short of a guideline goal is "watch". */
export function statusOf(r: LabResult, gender: Gender | null): Status {
  const [lo, hi] = rangeFor(r, gender);
  // A bound such as "<0.27" against "<0.50" is inside; ">90" against ">80" too.
  if (r.cmp === '<' && hi !== null && r.value <= hi) return goalStatus(r);
  if (r.cmp === '>' && lo !== null && r.value >= lo) return goalStatus(r);
  if (lo !== null && r.value < lo) return 'low';
  if (hi !== null && r.value > hi) return 'high';
  if (lo === null && hi === null) return goalStatus(r, 'unknown');
  return goalStatus(r);
}

function goalStatus(r: LabResult, otherwise: Status = 'ok'): Status {
  const m = MARKERS.find((x) => x.id === r.marker);
  const goal = m?.goal;
  if (!goal || (m.goalUnit && !m.goalUnit.test(r.unit ?? ''))) return otherwise === 'unknown' ? 'unknown' : otherwise;
  if (goal.below !== undefined && r.value >= goal.below && r.cmp !== '<') return 'watch';
  if (goal.above !== undefined && r.value < goal.above && r.cmp !== '>') return 'watch';
  return otherwise === 'unknown' ? 'ok' : otherwise;
}

export interface MarkerHistory {
  marker: string | null;
  name: string;
  latest: LabResult;
  /** Earlier results, oldest first. */
  earlier: LabResult[];
}

/** Each marker's latest result and its history, keyed by marker (or by name for unknown ones). */
export function histories(results: LabResult[]): MarkerHistory[] {
  const by = new Map<string, LabResult[]>();
  for (const r of results) {
    const key = r.marker ?? `name:${r.name}`;
    const list = by.get(key) ?? [];
    list.push(r);
    by.set(key, list);
  }
  return [...by.values()].map((list) => {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const latest = sorted[sorted.length - 1];
    return { marker: latest.marker, name: latest.name, latest, earlier: sorted.slice(0, -1) };
  });
}

/**
 * What's worth adding at the next test, for someone losing fat while training hard: the markers
 * missing from the latest test. Lp(a) only needs measuring once in a lifetime (EAS 2022).
 */
export const WORTH_TESTING = ['apob', 'ldl', 'lpa', 'hba1c', 'glucose', 'ferritin', 'hb', 'vitD', 'crp', 'tsh', 'testosterone', 'shbg', 'alt', 'cystatinC'] as const;

export function missingMarkers(results: LabResult[]): string[] {
  const have = new Set(results.map((r) => r.marker));
  return WORTH_TESTING.filter((m) => !have.has(m));
}

/**
 * The latest test: every result reported within 14 days of the newest one, since a lab reports
 * slow analyses (IGF-1, say) days after the rest of the same sample. Dated by the day most of its
 * results carry.
 */
export function latestRound(results: LabResult[]): { date: CivilDate; results: LabResult[] } | null {
  if (!results.length) return null;
  const newest = results.reduce((d, r) => (r.date > d ? r.date : d), results[0].date);
  const from = new Date(Date.parse(newest) - 14 * 86_400_000).toISOString().slice(0, 10);
  const round = results.filter((r) => r.date >= from);
  const counts = new Map<CivilDate, number>();
  for (const r of round) counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
  const date = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
  return { date, results: round };
}
