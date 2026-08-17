import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAction } from '../../src/browser/action-effects.mjs';
import { fillInput } from '../../src/browser/action-state.mjs';
import { clickControl, reorderSortable, stateDifference, stateSnapshot } from '../../src/browser/actions.mjs';
import { semanticDifference } from '../../src/browser/semantic.mjs';
import { BROWSER_FIXTURE_ORIGIN } from '../../src/browser/init.mjs';
import { requestFailureBucket } from '../../src/browser/session.mjs';
import { parseAndroidVersion } from '../../src/checks/android-config.mjs';
import { coverageArgs } from '../../src/checks/coverage.mjs';
import { projectSourceFile } from '../../src/checks/source-policy.mjs';

function evidence(overrides = {}) {
  return {
    url: '/', localStorage: [], sessionStorage: [], clipboard: '', media: [],
    dom: { hash: 'dom', items: [] }, actionState: { hash: 'state', signatures: [] },
    observed: { requests: 0, responses: 0, dialogs: 0, downloads: 0, popups: 0,
      consoleErrors: 0, pageErrors: 0, failedRequests: 0, httpErrors: 0 },
    ...overrides,
  };
}

test('action state hashes ignore origin and locator paths but preserve semantic controls', () => {
  const left = stateSnapshot('http://127.0.0.1:1/settings', [{ signature: 'button|save|0' }]);
  const right = stateSnapshot('https://example.test/settings', [{ signature: 'button|save|0' }]);
  assert.equal(left.hash, right.hash);
  assert.deepEqual(stateDifference(left, { ...right, signatures: ['button|cancel|0'] }), {
    missing: ['button|save|0'], unexpected: ['button|cancel|0'],
  });
});

test('state graphs distinguish one duplicate but bound unbounded identical instances', () => {
  const once = stateSnapshot('https://example.test/', [{ signature: 'button|tag|0' }]);
  const twice = stateSnapshot('https://example.test/', [{ signature: 'button|tag|0' }, { signature: 'button|tag|1' }]);
  const thrice = stateSnapshot('https://example.test/', [
    { signature: 'button|tag|0' }, { signature: 'button|tag|1' }, { signature: 'button|tag|2' },
  ]);
  assert.notEqual(once.hash, twice.hash);
  assert.equal(twice.hash, thrice.hash);
});

test('state graphs preserve sortable order for deterministic replay', () => {
  const left = stateSnapshot('https://example.test/', [
    { signature: 'tag|popular|0', roleDescription: 'sortable', path: 'main>div:1' },
    { signature: 'tag|drama|0', roleDescription: 'sortable', path: 'main>div:2' },
  ]);
  const right = stateSnapshot('https://example.test/', [
    { signature: 'tag|drama|0', roleDescription: 'sortable', path: 'main>div:1' },
    { signature: 'tag|popular|0', roleDescription: 'sortable', path: 'main>div:2' },
  ]);
  assert.notEqual(left.hash, right.hash);
});

test('silent controls fail while storage changes are independently observable', () => {
  const action = { aria: '保存', text: '保存' };
  const before = evidence();
  const silent = assessAction(action, { ok: true, operation: 'click' }, before, evidence());
  assert.equal(silent.ok, false);
  assert.equal(silent.failureKind, 'no-effect');
  const changed = assessAction(action, { ok: true, operation: 'click' }, before,
    evidence({ localStorage: [['saved', 'true']] }));
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.effects, ['localStorage']);
});

test('selected choices and current-location links are explicit idempotent actions', () => {
  const before = evidence({ url: '/settings' });
  const selected = assessAction({ selected: true }, { ok: true }, before, before);
  assert.equal(selected.idempotent, true);
  const link = assessAction({ href: '/settings' }, { ok: true }, before, before);
  assert.equal(link.idempotent, true);
});

test('blank-target clicks arm popup capture before clicking and preserve the final URL', async () => {
  let armed = false;
  let closed = false;
  const popup = { waitForLoadState: async () => {}, url: () => 'https://example.test/result',
    close: async () => { closed = true; } };
  const page = { waitForEvent: async (name) => { assert.equal(name, 'popup'); armed = true; return popup; } };
  const locator = { click: async () => { assert.equal(armed, true); } };
  const result = await clickControl(page, locator, '_blank');
  assert.deepEqual(result, { operation: 'click', popupUrl: 'https://example.test/result' });
  assert.equal(closed, true);
});

test('sortable controls skip singleton groups and use the keyboard sensor otherwise', async () => {
  const singleton = await reorderSortable({ locator: () => ({ count: async () => 1 }) }, {});
  assert.equal(singleton.idempotent, true);
  const keys = [];
  let order = ['|one', '|two'];
  const peers = { count: async () => 2, evaluateAll: async (_callback, targetId) => targetId
    ? { index: 0, order: [...order] } : [...order] };
  const page = { locator: () => peers, keyboard: { press: async (key) => {
    keys.push(key); if (key === 'ArrowRight') order = ['|two', '|one'];
  } }, waitForTimeout: async () => {} };
  const locator = { getAttribute: async () => '7', focus: async () => {} };
  const moved = await reorderSortable(page, locator);
  assert.equal(moved.operation, 'keyboard-sort');
  assert.deepEqual(moved.afterOrder, ['|two', '|one']);
  assert.deepEqual(keys, ['Space', 'ArrowRight', 'Space']);
});

test('intentional browser request cancellation is recorded separately from failures', () => {
  assert.equal(requestFailureBucket('net::ERR_ABORTED'), 'abortedRequests');
  assert.equal(requestFailureBucket('net::ERR_CONNECTION_REFUSED'), 'failedRequests');
});

test('seek controls require directional media proof', () => {
  const before = evidence({ media: [{ currentTime: 20, paused: true, muted: true, volume: 1, playbackRate: 1, currentSrc: 'x' }] });
  const after = evidence({ media: [{ currentTime: 10, paused: true, muted: true, volume: 1, playbackRate: 1, currentSrc: 'x' }] });
  const result = assessAction({ aria: '后退 10 秒', text: '' }, { ok: true }, before, after);
  assert.equal(result.ok, true);
  assert.equal(result.proof.kind, 'seek-backward');
});

test('URL inputs use the local interceptable import fixture', async () => {
  let value = '';
  await fillInput({ fill: async (next) => { value = next; } }, 'url');
  assert.equal(value, `${BROWSER_FIXTURE_ORIGIN}/source-import.json`);
});

test('filling an input with its existing deterministic value is idempotent', async () => {
  const result = await fillInput({ inputValue: async () => '验证', fill: async () => {} }, 'text');
  assert.equal(result.idempotent, true);
});

test('semantic deltas expose missing and unexpected visible controls', () => {
  assert.deepEqual(semanticDifference({ items: ['a', 'b'] }, { items: ['b', 'c'] }), {
    missing: ['a'], unexpected: ['c'],
  });
});

test('coverage, Android, and line policies are strict by construction', () => {
  const ctx = { config: { verifyDir: '/verify' } };
  const args = coverageArgs(ctx, '/reports');
  assert.ok(args.includes('--all'));
  assert.ok(args.includes('--100'));
  assert.ok(args.includes('app'));
  assert.ok(args.includes('components'));
  assert.ok(args.includes('lib'));
  assert.ok(args.includes('scripts'));
  assert.deepEqual(parseAndroidVersion('versionCode = 9\nversionName = "4.9.20"'), { versionName: '4.9.20', versionCode: 9 });
  assert.equal(projectSourceFile('/repo/app-release.json'), true);
  assert.equal(projectSourceFile('/repo/Dockerfile'), true);
  assert.equal(projectSourceFile('/repo/package-lock.json'), false);
});
