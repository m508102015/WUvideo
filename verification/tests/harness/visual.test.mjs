import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedNavigation } from '../../src/browser/mocks.mjs';
import { visualProblems } from '../../src/checks/visual.mjs';

function meta(overrides = {}) {
  return {
    status: 200,
    screenshot: '/tmp/capture.png',
    render: { textLength: 20 },
    semantic: { hash: 'same', items: [] },
    issues: [],
    observed: { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] },
    ...overrides,
  };
}

test('visual failures preserve successful local metadata when the remote render times out', () => {
  const item = {
    localMeta: meta(),
    remoteMeta: meta({
      render: { textLength: 0 },
      semantic: { hash: 'blank', items: [] },
      issues: [{ phase: 'render-wait', message: 'Timeout 30000ms exceeded' }],
      observed: { consoleErrors: [], pageErrors: [], httpErrors: [],
        failedRequests: [{ url: 'https://example.test/chunk.js', error: 'net::ERR_FAILED' }] },
    }),
    comparison: { ratio: 1 },
    comparisonError: null,
  };
  const problems = visualProblems(item, 0.02);
  assert.ok(problems.includes('remote render-wait: Timeout 30000ms exceeded'));
  assert.ok(problems.includes('remote visible text length 0'));
  assert.ok(problems.some((value) => value.includes('chunk.js')));
  assert.ok(!problems.includes('local document HTTP 0'));
  assert.ok(problems.includes('pixel ratio 1'));
  assert.ok(problems.includes('visible semantic DOM differs'));
});

test('visual reference navigation is never replaced by the external-link fixture', () => {
  const ctx = { config: { localUrl: 'http://127.0.0.1:3000', remoteUrl: null,
    referenceUrl: 'https://kvideo.pages.dev' } };
  assert.equal(allowedNavigation(new URL('https://kvideo.pages.dev/settings'), ctx), true);
  assert.equal(allowedNavigation(new URL('https://example.test/settings'), ctx), false);
});
