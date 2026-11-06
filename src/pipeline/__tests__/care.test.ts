import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../../lib/date';
import { doseStatus, readCarePlan, readEvent, type CareEvent } from '../care';
import { trainingDose } from '../trainingDose';
import { supplementAdvice } from '../supplements';
import { emptyRecord } from '../normalize';

const TODAY = '2026-11-07';

test('a care plan is read safely', () => {
  assert.deepEqual(readCarePlan({ clotHistory: true, anticoagulant: '  Apixaban ', dosesPerDay: 2, contact: 'x', notes: 'y' }), {
    clotHistory: true, anticoagulant: 'Apixaban', dosesPerDay: 2, trackDoses: false, contact: 'x', notes: 'y',
  });
  assert.equal(readCarePlan({ anticoagulant: '' }).dosesPerDay, null);
  assert.equal(readCarePlan(null).clotHistory, false);
  assert.equal(readEvent({ kind: 'event', date: TODAY, at: '2026-11-07T08:00:00Z', tag: 'nope', note: '' }), null);
  assert.ok(readEvent({ kind: 'dose', date: TODAY, at: '2026-11-07T08:00:00Z', slot: 'evening' }));
});

test('missed doses count only from the first one marked', () => {
  const plan = readCarePlan({ anticoagulant: 'Apixaban', dosesPerDay: 2, trackDoses: true });
  const dose = (i: number, slot: 'morning' | 'evening'): CareEvent => ({ kind: 'dose', date: addDays(TODAY, -i), at: `${addDays(TODAY, -i)}T08:00:00Z`, slot });
  const events = [dose(3, 'morning'), dose(3, 'evening'), dose(2, 'morning'), dose(1, 'morning'), dose(1, 'evening'), dose(0, 'morning')];
  const s = doseStatus(events, plan, TODAY)!;
  assert.equal(s.days, 3);
  assert.equal(s.missed, 1);
  assert.ok(s.morning);
  assert.equal(s.evening, null);
  assert.equal(doseStatus(events, readCarePlan({}), TODAY), null);
  assert.equal(doseStatus(events, readCarePlan({ anticoagulant: 'Apixaban' }), TODAY), null); // a pill organiser instead
});

test('a calf alert means rest, and an anticoagulant changes the supplement advice', () => {
  const d = trainingDose({ days: [emptyRecord(TODAY)], sessions: [], today: TODAY, readiness: null, calfAlert: true });
  assert.equal(d.level, 'rest');
  assert.equal(d.reasons[0], 'calf');
  const plan = readCarePlan({ clotHistory: true, anticoagulant: 'Apixaban', dosesPerDay: 2 });
  const advice = Object.fromEntries(supplementAdvice(new Map(), 'male', plan).map((a) => [a.id, a.verdict]));
  assert.equal(advice.omega3, 'avoid');
  assert.equal(advice.painkillers, 'avoid');
  assert.equal(advice.herbal, 'avoid');
  assert.equal(advice.creatine, 'take');
  const none = Object.fromEntries(supplementAdvice(new Map(), 'male').map((a) => [a.id, a.verdict]));
  assert.equal(none.painkillers, undefined);
});
