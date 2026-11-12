import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeTestosteroneFrom, freeTVerdict, vermeulen } from '../freeTestosterone';
import type { LabResult } from '../bloodwork';
import type { CivilDate } from '../../lib/date';

// Made-up results, not a real person's.
const r = (date: string, marker: string, name: string, value: number, unit: string): LabResult => ({
  date: date as CivilDate, name, marker, value, cmp: null, unit, refLow: null, refHigh: null,
});

test('Vermeulen: about 2 % free at an ordinary total and SHBG, less when SHBG is high', () => {
  const a = vermeulen(15, 30, 43)!;
  assert.ok(Math.abs(a.free - 326) < 2, String(a.free));
  assert.ok(Math.abs(a.percent - 2.17) < 0.02);
  const high = vermeulen(20, 60, 45)!;
  assert.ok(high.percent < a.percent);
  assert.equal(vermeulen(0, 30), null);
});

test('free testosterone needs an SHBG within 30 days; albumin is assumed when missing', () => {
  const t = r('2026-03-01', 'testosterone', 'S-Testosteron', 10, 'nmol/L');
  assert.equal(freeTestosteroneFrom([t]), null);
  assert.equal(freeTestosteroneFrom([t, r('2025-12-01', 'shbg', 'S-SHBG', 20, 'nmol/L')]), null);
  const f = freeTestosteroneFrom([t, r('2026-03-02', 'shbg', 'S-SHBG', 20, 'nmol/L')])!;
  assert.equal(f.albuminAssumed, true);
  assert.equal(f.albumin, 43);
  const g = freeTestosteroneFrom([t, r('2026-03-02', 'shbg', 'S-SHBG', 20, 'nmol/L'), r('2026-03-01', 'albumin', 'P-Albumin', 38, 'g/L')])!;
  assert.equal(g.albuminAssumed, false);
  assert.ok(g.free > f.free, 'less albumin leaves more free');
});

test('verdict for men: under 220 pmol/L is low', () => {
  const low = freeTestosteroneFrom([r('2026-03-01', 'testosterone', 'T', 7, 'nmol/L'), r('2026-03-01', 'shbg', 'S', 30, 'nmol/L')])!;
  assert.equal(freeTVerdict(low), 'low');
  const ok = freeTestosteroneFrom([r('2026-03-01', 'testosterone', 'T', 18, 'nmol/L'), r('2026-03-01', 'shbg', 'S', 30, 'nmol/L')])!;
  assert.equal(freeTVerdict(ok), 'ok');
});
