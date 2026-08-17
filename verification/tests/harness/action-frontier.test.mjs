import assert from 'node:assert/strict';
import test from 'node:test';
import { actionExecutionKey, classifyStateTransition, registerNovelState } from '../../src/policy/action-coverage.mjs';

function snapshot(location, signatures) {
  return { location, signatures };
}

test('new control signatures enter the semantic action frontier', () => {
  const discovered = new Set();
  registerNovelState(discovered, snapshot('/', ['theme:light']));
  const result = classifyStateTransition(discovered, snapshot('/', ['theme:light', 'search:filled']));
  assert.equal(result.queued, true);
  assert.deepEqual(result.newStateFacts, ['control:search:filled']);
});

test('signature order and independent combinations do not create duplicate frontier work', () => {
  const discovered = new Set();
  registerNovelState(discovered, snapshot('/', ['theme:dark', 'search:filled']));
  const result = classifyStateTransition(discovered, snapshot('/', ['search:filled', 'theme:dark']));
  assert.equal(result.queued, false);
  assert.equal(result.subsumed, true);
  assert.match(result.reason, /already covered/);
});

test('a new location always enters the frontier even with known controls', () => {
  const discovered = new Set();
  registerNovelState(discovered, snapshot('/', ['button:save']));
  const result = classifyStateTransition(discovered, snapshot('/settings#profile', ['button:save']));
  assert.equal(result.queued, true);
  assert.deepEqual(result.newStateFacts, ['location:/settings#profile']);
});

test('sortable permutations are verified but do not create a factorial frontier', () => {
  const discovered = new Set();
  registerNovelState(discovered, snapshot('/', ['sortable-order|main|popular>drama']));
  const result = classifyStateTransition(discovered, snapshot('/', ['sortable-order|main|drama>popular']));
  assert.equal(result.queued, false);
  assert.equal(result.subsumed, true);
});

test('unchanged controls execute once across independent state combinations', () => {
  const action = { key: 'main>button:1|button|save|enabled' };
  const left = { location: '/', signatures: ['theme:light'] };
  const right = { location: '/', signatures: ['theme:dark', 'search:filled'] };
  assert.equal(actionExecutionKey(left, action), actionExecutionKey(right, action));
  assert.notEqual(actionExecutionKey(left, action), actionExecutionKey({ ...right, location: '/settings' }, action));
  assert.notEqual(actionExecutionKey(left, action), actionExecutionKey(left, { key: `${action.key}|pressed` }));
});

test('blocked transitions remain recorded outcomes but are not queued or subsumed', () => {
  const discovered = new Set();
  const entries = [{ action: 'executed' }];
  const result = classifyStateTransition(discovered, snapshot('/', ['button:add']), 'action failed');
  assert.equal(entries.length, 1);
  assert.deepEqual(result, { eligible: false, queued: false, subsumed: false,
    reason: 'action failed', newStateFacts: [] });
});
