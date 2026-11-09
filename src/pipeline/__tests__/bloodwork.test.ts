import { test } from 'node:test';
import assert from 'node:assert/strict';
import { histories, latestRound, markerFor, missingMarkers, parseLabText, rangeFor, statusOf } from '../bloodwork';
import { supplementAdvice } from '../supplements';

// A made-up report, laid out the way a Swedish lab prints one. Not a real person's results.
const REPORT = `
Analyssvar 9 av 9 svar rapporterat
ANALYS ENHET RESULTAT REF.INTERVALL RAPPORTERAD
B-Hemoglobin g/L 175 134 - 170 2026-03-02 09:10
B-EVF 0.48 0.39 - 0.50 2026-03-02 09:10
B-Celler, cytokemisk, (diff) Se svar 2026-03-02 09:10
P-D-dimer mg/L <0.27 <0.50 2026-03-02 09:11
Pt-eGFR(krea) relativ mL/min/1,73m² >90 >80 2026-03-02 09:12
S-25-OH-vitamin D nmol/L 52 25 - 105 2026-03-02 09:15
Kommentar: Bedömning av S-25-OH Vitamin D:
Resultat <25 nmol/L : D-vitaminbrist
S-Apolipoprotein A1 g/L 1.4 0.9 - 1.8 2026-03-02 09:14
S-Apolipoprotein B g/L 0.95 0.6 - 1.6 2026-03-02 09:14
S-DHEAS,
Dehydroepiandrosteronsulfat
µmol/L 6.1 3.3 - 13.9 2026-03-02 09:20
S-SHBG nmol/L 80 2026-03-02 09:20
Kommentar: Referensintervall S-SHBG:
Män, <60 år: 15 - 70 nmol/L (högre koncentration vid högre åldrar)
S-LDL kolesterol direkt mmol/L 3.4 1.2 - 4.3 2026-03-02 09:14
`;

test('a lab report is read row by row, wrapped names joined, comments left out', () => {
  const { results, unread } = parseLabText(REPORT);
  assert.deepEqual(unread, []);
  assert.deepEqual(results.map((r) => r.marker), ['hb', 'hct', 'ddimer', 'egfrCrea', 'vitD', 'apoa1', 'apob', 'dheas', 'shbg', 'ldl']);
  const ddimer = results.find((r) => r.marker === 'ddimer')!;
  assert.equal(ddimer.cmp, '<');
  assert.equal(ddimer.refHigh, 0.5);
  const egfr = results.find((r) => r.marker === 'egfrCrea')!;
  assert.equal(egfr.unit, 'mL/min/1,73m²');
  assert.equal(egfr.refLow, 80);
  assert.equal(results.find((r) => r.marker === 'hct')!.unit, null);
});

test('one result a line works too', () => {
  const { results } = parseLabText('2026-11-06; S-Ferritin; 45; µg/L; 30-350\n2026-11-06;S-CRP;<0,6;mg/L;<5');
  assert.equal(results.length, 2);
  assert.equal(results[0].marker, 'ferritin');
  assert.equal(results[1].value, 0.6);
  assert.equal(results[1].cmp, '<');
});

test('status: outside the range, short of a goal, or fine', () => {
  const { results } = parseLabText(REPORT);
  const by = (m: string) => results.find((r) => r.marker === m)!;
  assert.equal(statusOf(by('hb'), 'male'), 'high');
  assert.equal(statusOf(by('vitD'), 'male'), 'watch'); // in range, under 75
  assert.equal(statusOf(by('ldl'), 'male'), 'watch'); // in range, over 3.0
  assert.equal(statusOf(by('apob'), 'male'), 'ok');
  assert.equal(statusOf(by('ddimer'), 'male'), 'ok');
  assert.equal(statusOf(by('egfrCrea'), 'male'), 'ok');
  // SHBG has its range only in a comment: the one for men applies when the person is a man.
  assert.deepEqual(rangeFor(by('shbg'), 'male'), [15, 70]);
  assert.equal(statusOf(by('shbg'), 'male'), 'high');
  assert.equal(statusOf(by('shbg'), null), 'unknown');
});

test('markers match the names labs use', () => {
  assert.equal(markerFor('S-Apo B/ Apo A1 kvot')?.id, 'apobA1');
  assert.equal(markerFor('S-Lp(a)')?.id, 'lpa');
  assert.equal(markerFor('Pt-eGFR(CystC) relativ')?.id, 'egfrCys');
  assert.equal(markerFor('S-Cystatin C')?.id, 'cystatinC');
  assert.equal(markerFor('S-Testosteron, bioaktivt')?.id, 'testosteroneBio');
  assert.equal(markerFor('S-Testosteron/SHBG kvot')?.id, 'tShbg');
  assert.equal(markerFor('S-Kobalamin, B12')?.id, 'b12');
  assert.equal(markerFor('fS-HDL-kolesterol')?.id, 'hdl');
  assert.equal(markerFor('S-non-HDL-kolesterol')?.id, 'nonHdl');
  assert.equal(markerFor('S-Kolesterol')?.id, 'chol');
  assert.equal(markerFor('S-Kreatinin')?.id, 'creatinine');
  assert.equal(markerFor('S-CK')?.id, 'ck');
});

test('history, what to add next time, and supplement advice', () => {
  const { results } = parseLabText(REPORT + '\nS-25-OH-vitamin D nmol/L 80 25 - 105 2026-09-01 08:00');
  const h = histories(results).find((x) => x.marker === 'vitD')!;
  assert.equal(h.latest.value, 80);
  assert.equal(h.earlier[0].value, 52);
  assert.ok(missingMarkers(results).includes('ferritin'));
  assert.ok(missingMarkers(results).includes('lpa'));
  const latest = new Map(histories(results).filter((x) => x.marker).map((x) => [x.marker!, x.latest]));
  const advice = Object.fromEntries(supplementAdvice(latest, 'male').map((a) => [a.id, a.verdict]));
  assert.equal(advice.creatine, 'take');
  assert.equal(advice.vitaminD, 'skip'); // 80 now
  assert.equal(advice.iron, 'avoid'); // haemoglobin above range
  assert.equal(advice.ldlFoods, 'consider'); // LDL 3.4
});

test('a slow analysis reported days later belongs to the same test', () => {
  const { results } = parseLabText(REPORT + '\nS-IGF-1 µg/L 210 93 - 250 2026-03-05 15:17');
  const round = latestRound(results)!;
  assert.equal(round.date, '2026-03-02');
  assert.equal(round.results.length, results.length);
});

test('1177 names with long dashes match, and urine results are not taken for blood markers', () => {
  assert.equal(markerFor('P—Glukos')?.id, 'glucose');
  assert.equal(markerFor('B—Leukocyter')?.id, 'wbc');
  assert.equal(markerFor('U—Leukocyter (remsa)'), null);
  assert.equal(markerFor('U-Albumin'), null);
  assert.equal(markerFor('U—Glukos (remsa)'), null);
  assert.equal(markerFor('P—Albumin')?.id, 'albumin');
});
