import assert from 'node:assert/strict';
import test from 'node:test';
import { PROXY_FIXTURES } from '../../src/checks/proxy.mjs';

test('public proxy fixtures are HTTPS and independent of GitHub history', () => {
  for (const url of Object.values(PROXY_FIXTURES)) {
    assert.equal(new URL(url).protocol, 'https:');
  }
  assert.equal(new URL(PROXY_FIXTURES.binary).hostname, 'httpbingo.org');
  assert.equal(new URL(PROXY_FIXTURES.range).hostname, 'httpbingo.org');
  assert.equal(new URL(PROXY_FIXTURES.notFound).hostname, 'httpbingo.org');
  assert.doesNotMatch(Object.values(PROXY_FIXTURES).join('\n'), /github/i);
});
