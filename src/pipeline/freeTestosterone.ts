import type { CivilDate } from '../lib/date';
import type { LabResult } from './bloodwork';

/**
 * Free testosterone worked out from total testosterone, SHBG and albumin with the Vermeulen
 * formula (Vermeulen, Verdonck & Kaufman 1999, J Clin Endocrinol Metab 84:3666): testosterone is
 * shared between SHBG (tight binding, K = 1e9 L/mol), albumin (loose, K = 3.6e4 L/mol) and the
 * free fraction the body can use. Solving the binding equilibrium for the free part gives a
 * quadratic. Bioavailable testosterone is the free part plus the part loosely held by albumin.
 *
 * For men, a free testosterone under about 220 pmol/L with symptoms is what the European Male
 * Ageing Study used for low (Wu 2010, NEJM 363:123); the Endocrine Society (Bhasin 2018) leans on
 * free testosterone when total testosterone is borderline (about 8–12 nmol/L) or SHBG is unusual.
 */

const K_SHBG = 1e9;
const K_ALB = 3.6e4;
const ALBUMIN_G_PER_MOL = 69_000;
export const DEFAULT_ALBUMIN = 43;
export const FREE_T_LOW_PMOL = 220;
/** Total testosterone (nmol/L) between these is where free testosterone decides. */
export const TOTAL_T_GREY: [number, number] = [8, 12];

export interface FreeT {
  /** pmol/L */
  free: number;
  /** nmol/L */
  bioavailable: number;
  /** Free as a share of total, in percent. */
  percent: number;
}

/** Total testosterone and SHBG in nmol/L, albumin in g/L. */
export function vermeulen(totalNmol: number, shbgNmol: number, albuminGL = DEFAULT_ALBUMIN): FreeT | null {
  if (!(totalNmol > 0) || !(shbgNmol >= 0) || !(albuminGL > 0)) return null;
  const tt = totalNmol * 1e-9;
  const shbg = shbgNmol * 1e-9;
  const n = 1 + K_ALB * (albuminGL / ALBUMIN_G_PER_MOL);
  const a = n * K_SHBG;
  const b = n + K_SHBG * (shbg - tt);
  const ft = (-b + Math.sqrt(b * b + 4 * a * tt)) / (2 * a);
  return { free: ft * 1e12, bioavailable: ft * n * 1e9, percent: (100 * ft) / tt };
}

export interface FreeTResult extends FreeT {
  date: CivilDate;
  total: number;
  shbg: number;
  albumin: number;
  albuminAssumed: boolean;
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const inNmol = (r: LabResult) => r.cmp === null && (r.unit === null || /nmol/i.test(r.unit));

/**
 * Free testosterone from the latest total testosterone that has an SHBG from within 30 days of it
 * (albumin too when there is one; 43 g/L otherwise). Null when there's no such pair.
 */
export function freeTestosteroneFrom(results: LabResult[]): FreeTResult | null {
  const newestFirst = [...results].sort((x, y) => y.date.localeCompare(x.date));
  for (const t of newestFirst.filter((r) => r.marker === 'testosterone' && inNmol(r))) {
    const s = newestFirst.find((r) => r.marker === 'shbg' && inNmol(r) && daysApart(r.date, t.date) <= 30);
    if (!s) continue;
    const alb = newestFirst.find((r) => r.marker === 'albumin' && r.cmp === null && /g\/l/i.test(r.unit ?? '') && daysApart(r.date, t.date) <= 30 && !/^u/i.test(r.name));
    const albumin = alb?.value ?? DEFAULT_ALBUMIN;
    const f = vermeulen(t.value, s.value, albumin);
    if (f) return { ...f, date: t.date, total: t.value, shbg: s.value, albumin, albuminAssumed: !alb };
  }
  return null;
}

/** For men: low, borderline or fine, from the free value and the total. */
export function freeTVerdict(r: FreeTResult): 'low' | 'borderline' | 'ok' {
  if (r.free < FREE_T_LOW_PMOL) return 'low';
  if (r.total < TOTAL_T_GREY[1] && r.free < FREE_T_LOW_PMOL * 1.15) return 'borderline';
  return 'ok';
}
