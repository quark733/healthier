import { rangeFor, type LabResult } from './bloodwork';
import type { Gender } from './registry';

/**
 * Supplements, judged from the person's own blood results and their goal (keep muscle and
 * strength while losing fat). Only ones with a real evidence base, and the reason each is or isn't
 * worth it for this person. Amounts are the general ones from the named sources, not a prescription.
 *
 *   creatine   Strongest evidence of any supplement for strength and lean mass; 3–5 g a day; safe in
 *              healthy people (ISSN position stand, Kreider et al. 2017). It raises blood creatinine
 *              without harming the kidneys, so cystatin C is the better kidney check for someone on it.
 *   vitaminD   Below 75 nmol/L is "insufficient" by Swedish labs' own comment; the sun gives almost
 *              none from October to March. 10 µg a day is the recommended intake, 100 µg the upper
 *              limit (EFSA). Retest after about 3 months.
 *   caffeine   Improves strength and endurance performance (ISSN position stand, Guest et al. 2021),
 *              but 400 mg taken 6 hours before bed cut sleep by over an hour (Drake et al. 2013), and
 *              sleep is what keeps muscle on a diet. Timing matters more than dose for an evening lifter.
 *   ldlFoods   Oat beta-glucan (3 g a day) and plant sterols (1.5–3 g a day, LDL down 7–12%) are the two
 *              food additions with EU-approved claims for lowering LDL (EFSA; Regulation (EU) 686/2014).
 *   omega3     Lowers triglycerides; little reason to take it when they're normal.
 *   iron       Never without a measured need: with haemoglobin already high it's the wrong direction.
 *   b12        Above the range usually means supplements or fortified drinks already cover it.
 *   magnesium  No benefit shown when blood levels are normal.
 */

export type SupplementId = 'creatine' | 'vitaminD' | 'caffeine' | 'ldlFoods' | 'omega3' | 'iron' | 'b12' | 'magnesium';
export type SupplementVerdict = 'take' | 'consider' | 'timing' | 'skip' | 'avoid' | 'test';

export interface SupplementAdvice {
  id: SupplementId;
  verdict: SupplementVerdict;
  /** The result it's judged from, for the page to quote. */
  from: LabResult | null;
}

export function supplementAdvice(latest: Map<string, LabResult>, gender: Gender | null): SupplementAdvice[] {
  const get = (id: string) => latest.get(id) ?? null;
  const above = (r: LabResult | null) => {
    if (!r) return false;
    const [, hi] = rangeFor(r, gender);
    return hi !== null && r.value > hi;
  };
  const out: SupplementAdvice[] = [];

  out.push({ id: 'creatine', verdict: 'take', from: get('cystatinC') ?? get('creatinine') });

  const d = get('vitD');
  out.push({ id: 'vitaminD', verdict: !d ? 'test' : d.value < 75 ? 'consider' : 'skip', from: d });

  out.push({ id: 'caffeine', verdict: 'timing', from: null });

  const ldl = get('ldl');
  const apob = get('apob');
  const lipidsHigh = (ldl && ldl.value >= 3.0) || (apob && apob.value >= 1.0);
  out.push({ id: 'ldlFoods', verdict: !ldl && !apob ? 'test' : lipidsHigh ? 'consider' : 'skip', from: apob ?? ldl });

  const tg = get('tg');
  out.push({ id: 'omega3', verdict: tg && tg.value >= 1.7 ? 'consider' : 'skip', from: tg });

  const hb = get('hb');
  const ferritin = get('ferritin');
  out.push({ id: 'iron', verdict: above(hb) || above(ferritin) ? 'avoid' : ferritin ? 'skip' : 'test', from: above(hb) ? hb : ferritin });

  // Only said when the result speaks to it: B12 above the range, magnesium inside it.
  const b12 = get('b12');
  if (above(b12)) out.push({ id: 'b12', verdict: 'skip', from: b12 });

  const mg = get('magnesium');
  if (mg && !above(mg) && (rangeFor(mg, gender)[0] ?? -Infinity) <= mg.value) out.push({ id: 'magnesium', verdict: 'skip', from: mg });

  return out;
}
