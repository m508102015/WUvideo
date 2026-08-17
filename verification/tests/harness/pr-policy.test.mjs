import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluatePrEvidence, parsePrBody } from '../../src/policy/pr-evidence.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-pr-policy-'));
  const file = 'verification/tests/regression/example.test.ts';
  fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), '// GH-ISSUE: 12; GH-PR: 90\n');
  return { root, file };
}

test('PR fields parse issue and pull-request references without ambiguity', () => {
  const parsed = parsePrBody([
    'Historical-Refs: #12, PR #90',
    'Regression-Evidence: verification/tests/regression/example.test.ts',
  ].join('\n'));
  assert.deepEqual(parsed.refs, [{ kind: 'ISSUE', number: 12 }, { kind: 'PR', number: 90 }]);
});

test('changed executable evidence satisfies code-change policy', () => {
  const { root, file } = fixture();
  try {
    const result = evaluatePrEvidence(root, ['app/page.tsx', file], [
      'Historical-Refs: #12, PR #90',
      `Regression-Evidence: ${file}`,
    ].join('\n'));
    assert.equal(result.ok, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing direct trace and path traversal both fail', () => {
  const { root } = fixture();
  try {
    const result = evaluatePrEvidence(root, ['app/page.tsx'], [
      'Historical-Refs: #999',
      'Regression-Evidence: ../outside.test.ts',
    ].join('\n'));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Disallowed evidence path/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('documentation-only changes do not require regression fields', () => {
  const result = evaluatePrEvidence('/tmp', ['README.md'], '');
  assert.equal(result.ok, true);
});

test('verification owns a local template for every enforced evidence field', () => {
  const template = fs.readFileSync(new URL('../../history/pr-evidence-template.md', import.meta.url), 'utf8');
  for (const field of ['Historical-Refs:', 'Regression-Evidence:', 'Regression-Evidence-Reason:']) {
    assert.equal(template.includes(field), true, `${field} missing from PR template`);
  }
});
