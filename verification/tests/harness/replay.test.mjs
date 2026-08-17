import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForExpectedState } from '../../src/checks/ui-action-replay.mjs';

function state(hash, signatures = []) {
  return { actions: [], snapshot: { hash, location: '/settings', signatures } };
}

test('state replay survives a transient empty modal state beyond the old timeout', async () => {
  const expectedState = state('expected', ['button|confirm']).snapshot;
  let reads = 0;
  let pauses = 0;
  const result = await waitForExpectedState({
    expectedState,
    readCurrent: async () => {
      reads += 1;
      return reads <= 8 ? state('transient') : state('expected', ['button|confirm']);
    },
    pause: async () => { pauses += 1; },
  });
  assert.equal(result.ok, true);
  assert.equal(reads, 9);
  assert.equal(pauses, 8);
  assert.equal(result.snapshot.hash, expectedState.hash);
});

test('state replay still rejects a persistent exact-hash mismatch', async () => {
  let reads = 0;
  let pauses = 0;
  const result = await waitForExpectedState({
    expectedState: state('expected', ['button|confirm']).snapshot,
    readCurrent: async () => { reads += 1; return state('wrong', ['button|cancel']); },
    pause: async () => { pauses += 1; },
    retries: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(reads, 4);
  assert.equal(pauses, 3);
  assert.equal(result.expectedHash, 'expected');
  assert.equal(result.actualHash, 'wrong');
  assert.deepEqual(result.missing, ['button|confirm']);
  assert.deepEqual(result.unexpected, ['button|cancel']);
});
