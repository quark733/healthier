import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLogEntry } from '../healthLog';

test('log entries are checked before they are kept', () => {
  assert.deepEqual(readLogEntry({ date: '2026-11-07', at: '2026-11-07T08:00:00Z', tag: 'sick', note: ' cold ' }), {
    id: undefined, date: '2026-11-07', at: '2026-11-07T08:00:00Z', tag: 'sick', note: 'cold',
  });
  assert.equal(readLogEntry({ date: '2026-11-07', at: '2026-11-07T08:00:00Z', tag: 'calf' }), null);
  assert.equal(readLogEntry({ date: 'x', at: '2026-11-07T08:00:00Z', tag: 'sick' }), null);
});
