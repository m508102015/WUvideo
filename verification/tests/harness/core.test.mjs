import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { actionTransitioned } from '../../src/browser/actions.mjs';
import { stableGeneratedValue } from '../../src/browser/action-normalize.mjs';
import { BROWSER_FIXTURE_ORIGIN, sourceArgument } from '../../src/browser/init.mjs';
import { numericCandidate, prepareActionState } from '../../src/browser/action-state.mjs';
import { getConfig } from '../../src/config.mjs';
import { latestDeployment } from '../../src/checks/deployment.mjs';
import { auditArgs } from '../../src/checks/harness-dependencies.mjs';
import { findDangerousConstructs } from '../../src/checks/security-scan.mjs';
import { runCommand } from '../../src/core/command.mjs';
import { redact, redactText } from '../../src/core/redact.mjs';
import { escapeXml } from '../../src/core/xml.mjs';

test('redacts keyed secrets recursively', () => {
  assert.deepEqual(redact({ nested: { password: 'value', safe: 'visible' } }), {
    nested: { password: '[REDACTED]', safe: 'visible' },
  });
});

test('redacts bearer, GitHub, JWT, and query credentials', () => {
  const token = ['gho', '_abcdefghijklmnopqrstuvwxyz123456'].join('');
  const raw = `Bearer abc.def ${token} ?token=secret-value`;
  const result = redactText(raw);
  assert.doesNotMatch(result, /abcdefghijklmnopqrstuvwxyz|secret-value/);
});

test('escapes XML metacharacters', () => {
  assert.equal(escapeXml(`<a x="1">Tom & 'Ada'</a>`), '&lt;a x=&quot;1&quot;&gt;Tom &amp; &apos;Ada&apos;&lt;/a&gt;');
});

test('chooses valid alternative values for numeric and range inputs', () => {
  assert.equal(numericCandidate({ min: '0', max: '1', value: '0.5', step: '0.01' }), '0');
  assert.equal(numericCandidate({ min: '10', max: '100', value: '70', step: '1' }), '55');
});

test('maps play and pause controls to deterministic media preconditions', async () => {
  const modes = [];
  const page = { evaluate: async (_callback, mode) => modes.push(mode) };
  await prepareActionState(page, { aria: '播放' });
  await prepareActionState(page, { aria: 'Pause' });
  await prepareActionState(page, { aria: '搜索' });
  assert.deepEqual(modes, [
    { expected: 'paused', labelText: '播放' },
    { expected: 'playing', labelText: 'pause' },
  ]);
});

test('accepts explicit full-run action budgets', () => {
  const config = getConfig(['node', 'verify', '--root', process.cwd(), '--max-actions', '1234', '--max-action-depth', '7']);
  assert.equal(config.maxActionStates, 1234);
  assert.equal(config.maxActionDepth, 7);
});

test('GitHub auditing is explicit and disabled by default', () => {
  assert.equal(getConfig(['node', 'verify']).auditGithub, false);
  assert.equal(getConfig(['node', 'verify', '--audit-github']).auditGithub, true);
});

test('verification dependency audit fails only at the declared severe threshold', () => {
  assert.deepEqual(auditArgs(), [
    'audit', '--omit=dev', '--audit-level=high', '--json',
  ]);
});

test('skipped controls cannot create recursive action states', () => {
  assert.equal(actionTransitioned({ ok: true, skipped: true }, 'before', 'after'), false);
  assert.equal(actionTransitioned({ ok: true, idempotent: true }, 'before', 'after'), false);
  assert.equal(actionTransitioned({ ok: true }, 'before', 'after'), true);
});

test('generated source IDs do not create false action states', () => {
  assert.equal(stableGeneratedValue('source-id', 'custom-msa9oem1'), 'source-id:<generated>');
  assert.equal(stableGeneratedValue('source-id', 'user-chosen-id'), 'user-chosen-id');
  assert.equal(stableGeneratedValue('other-id', 'custom-msa9oem1'), 'custom-msa9oem1');
});

test('browser fixtures use an interceptable HTTPS origin', () => {
  assert.equal(new URL(BROWSER_FIXTURE_ORIGIN).protocol, 'https:');
  assert.equal(sourceArgument(BROWSER_FIXTURE_ORIGIN).sourceConfig.baseUrl, BROWSER_FIXTURE_ORIGIN);
});

test('selects the newest Cloudflare production deployment', () => {
  const output = JSON.stringify([
    { Environment: 'Production', Source: 'abcdef1', Deployment: 'https://new.pages.dev' },
    { Environment: 'Production', Source: '1234567', Deployment: 'https://old.pages.dev' },
  ]);
  assert.equal(latestDeployment(output)?.Source, 'abcdef1');
  assert.equal(latestDeployment('not json'), null);
});

test('dangerous construct scan ignores matcher text and finds runtime use', () => {
  const scanner = "const name = 'dangerouslySetInnerHTML'; const matcher = /eval\\s*\\(/;";
  assert.deepEqual(findDangerousConstructs('scanner.mjs', scanner), []);
  const runtime = "export const View = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />; eval('x');";
  assert.deepEqual(findDangerousConstructs('view.tsx', runtime), [
    { file: 'view.tsx', construct: 'dangerouslySetInnerHTML' },
    { file: 'view.tsx', construct: 'eval' },
  ]);
});

test('command capture preserves UTF-8 split across process chunks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-command-'));
  const ctx = { config: { root, commandTimeoutMs: 10_000 }, dirs: { raw: root } };
  const script = "const b=Buffer.from('识');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),10)";
  try {
    const result = await runCommand(ctx, 'utf8', process.execPath, ['-e', script]);
    assert.equal(result.code, 0);
    assert.equal(fs.readFileSync(result.outputPath, 'utf8'), '识');
    assert.equal(result.tail, '识');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
