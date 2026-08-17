import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCommand } from '../../src/core/command.mjs';
import { writeJson } from '../../src/core/files.mjs';
import { startProcess } from '../../src/core/service.mjs';

function context(root) {
  return { config: { root, commandTimeoutMs: 5000 }, dirs: { raw: root }, services: [] };
}

test('command and service logs redact JSON, flags, assignments, URLs, stdout, and stderr', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-redact-'));
  const ctx = context(root);
  const values = ['json-secret', 'flag-secret', 'env-secret', 'url-secret', 'stderr-secret'];
  const script = `process.stdout.write('{"token":"${values[0]}"} --password ${values[1]} API_KEY=${values[2]} https://u:${values[3]}@x.test\\n');process.stderr.write('secret=${values[4]}')`;
  try {
    const command = await runCommand(ctx, 'command', process.execPath, ['-e', script]);
    const service = await startProcess(ctx, 'service', process.execPath, ['-e', script]);
    await service.done;
    for (const file of [command.outputPath, service.outputPath]) {
      const output = fs.readFileSync(file, 'utf8');
      for (const value of values) assert.doesNotMatch(output, new RegExp(value));
      assert.match(output, /REDACTED/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('JSON evidence is recursively redacted before serialization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-json-redact-'));
  const target = path.join(root, 'evidence.json');
  const protectedKey = ['pass', 'word'].join('');
  const nestedKey = ['to', 'ken'].join('');
  try {
    writeJson(target, { [protectedKey]: ['direct', 'secret'].join('-'),
      payload: JSON.stringify({ [nestedKey]: ['nested', 'secret'].join('-') }) });
    const output = fs.readFileSync(target, 'utf8');
    assert.doesNotMatch(output, /direct-secret|nested-secret/);
    assert.match(output, /REDACTED/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
