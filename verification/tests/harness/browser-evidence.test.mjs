import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assessAction, browserEvidence } from '../../src/browser/action-effects.mjs';
import { prepareReplayBaseline, revealActionControls } from '../../src/browser/action-state.mjs';

function evidence(fileChoosers) {
  return {
    url: '/', localStorage: [], sessionStorage: [], clipboard: '', display: {}, media: [],
    dom: { hash: 'dom', items: [] }, actionState: { hash: 'state', signatures: [] },
    observed: { requests: 0, responses: 0, dialogs: 0, downloads: 0, fileChoosers,
      popups: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0, httpErrors: 0 },
    observedEvents: {},
  };
}

test('opening a native file chooser is an independently observable effect', () => {
  const result = assessAction({ tag: 'button', text: '选择文件' }, { ok: true }, evidence(0), evidence(1));
  assert.equal(result.ok, true);
  assert.deepEqual(result.effects, ['fileChoosers']);
});

test('opaque documents preserve evidence instead of crashing on blocked storage', () => {
  const denied = () => { const error = new Error('Access is denied'); error.name = 'SecurityError'; throw error; };
  const scope = {
    document: { querySelectorAll: () => [], body: {},
      documentElement: { className: '', getAttribute: () => '' } },
    location: { pathname: 'blank', search: '', hash: '' },
    getComputedStyle: () => ({ colorScheme: '', color: '', backgroundColor: '' }),
    get localStorage() { return denied(); },
    get sessionStorage() { return denied(); },
  };
  const result = browserEvidence(scope);
  assert.deepEqual(result.localStorage, [['<unavailable>', 'SecurityError: Access is denied']]);
  assert.deepEqual(result.sessionStorage, result.localStorage);
  assert.equal(result.url, 'blank');
});

test('cursor-only labels and containers with declared controls are not duplicate actions', () => {
  const source = fs.readFileSync(new URL('../../src/browser/action-scan.mjs', import.meta.url), 'utf8');
  assert.match(source, /element\.tagName === 'LABEL'/);
  assert.match(source, /element\.querySelector\(selector\)/);
});

test('modal layer filtering runs before offscreen controls are accepted', () => {
  const source = fs.readFileSync(new URL('../../src/browser/action-scan.mjs', import.meta.url), 'utf8');
  const layerGate = source.indexOf('if (blockingZ > layer(element)) return false');
  const offscreenGate = source.indexOf('if (outside(box)) return true');
  assert.ok(layerGate >= 0);
  assert.ok(offscreenGate > layerGate);
});

test('control scans preserve the real hover target while revealing player controls', async () => {
  let evaluated = false;
  let pointerMoved = false;
  const page = {
    viewportSize: () => ({ width: 820, height: 1180 }),
    evaluate: async () => { evaluated = true; },
    mouse: { move: async () => { pointerMoved = true; } },
  };
  await revealActionControls(page);
  assert.equal(evaluated, true);
  assert.equal(pointerMoved, false);
});

test('action replay starts from a deterministic paused-media baseline', async () => {
  let waited = 0;
  let evaluated = false;
  const page = { evaluate: async () => { evaluated = true; }, waitForTimeout: async (ms) => { waited = ms; } };
  await prepareReplayBaseline(page);
  assert.equal(evaluated, true);
  assert.equal(waited, 100);
});
