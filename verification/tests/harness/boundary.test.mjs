import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { verificationChange } from '../../src/checks/preflight.mjs';

test('only verification-folder changes satisfy the publishing boundary', () => {
  assert.equal(verificationChange(' M verification/src/main.mjs'), true);
  assert.equal(verificationChange('?? verification/history/catalog.json'), true);
  assert.equal(verificationChange(' M package.json'), false);
  assert.equal(verificationChange(' D tests/example.test.ts'), false);
  assert.equal(verificationChange(' M .github/workflows/release.yml'), false);
});

test('renames are judged by their final destination', () => {
  assert.equal(verificationChange('R  old.test.ts -> verification/tests/regression/old.test.ts'), true);
  assert.equal(verificationChange('R  verification/old.mjs -> app/old.mjs'), false);
});

test('the complete runner repeats the workspace boundary check after all tools', () => {
  const source = fs.readFileSync(new URL('../../src/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /checkWorkspaceBoundary\(ctx, 'postflight'\)/);
});

test('Gradle caches are redirected below verification', () => {
  const source = fs.readFileSync(new URL('../../src/checks/android.mjs', import.meta.url), 'utf8');
  assert.match(source, /ctx\.config\.verifyDir, 'cache', 'gradle'/);
  assert.match(source, /--project-cache-dir/);
  assert.match(source, /GRADLE_USER_HOME/);
});
