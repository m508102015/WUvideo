import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { actionCoverageStatus } from '../../src/policy/action-coverage.mjs';

test('zero-control route surfaces always fail interaction coverage', () => {
  assert.equal(actionCoverageStatus({ quick: true, cappedRoutes: [], emptyRoutes: ['mobile:/'] }), 'FAIL');
});

test('action caps skip only quick runs and fail complete runs', () => {
  assert.equal(actionCoverageStatus({ quick: true, cappedRoutes: ['desktop:/settings'], emptyRoutes: [] }), 'SKIP');
  assert.equal(actionCoverageStatus({ quick: false, cappedRoutes: ['desktop:/settings'], emptyRoutes: [] }), 'FAIL');
});

test('Next production build runs after the Cloudflare adapter build', () => {
  const source = fs.readFileSync(new URL('../../src/checks/static-tools.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf("'cloudflare-pages-build'") < source.indexOf("'next-build'"));
});

test('action path replay verifies every expected state transition', () => {
  const source = fs.readFileSync(new URL('../../src/checks/ui-action-replay.mjs', import.meta.url), 'utf8');
  assert.match(source, /waitForTransition\(page, before\.snapshot\.hash\)/);
  assert.match(source, /current\.snapshot\.hash === expectedState\.hash/);
  assert.match(source, /stateDifference\(expectedState, current\.snapshot\)/);
  assert.match(source, /attempt <= 3/);
});
