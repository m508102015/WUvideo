import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCommand } from '../../src/core/command.mjs';
import { lineCount, readJson, relative, walk, writeJson } from '../../src/core/files.mjs';

test('file helpers inventory and serialize deterministic fixtures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-verify-'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.mkdirSync(path.join(root, 'build'));
  fs.writeFileSync(path.join(root, 'nested', 'file.txt'), 'one\ntwo\n');
  fs.writeFileSync(path.join(root, 'build', 'generated.txt'), 'generated');
  const json = path.join(root, 'result.json');
  writeJson(json, { ok: true });
  assert.equal(lineCount(path.join(root, 'nested', 'file.txt')), 3);
  assert.equal(relative(root, path.join(root, 'nested', 'file.txt')), 'nested/file.txt');
  assert.deepEqual(readJson(json), { ok: true });
  assert.equal(walk(root, (file) => file.endsWith('.txt')).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('command logs are flushed before command completion resolves', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-command-'));
  const raw = path.join(root, 'raw');
  fs.mkdirSync(raw);
  const ctx = { config: { root, commandTimeoutMs: 5000 }, dirs: { raw } };
  const result = await runCommand(ctx, 'flush', process.execPath, ['-e', "process.stdout.write('x'.repeat(50000))"]);
  assert.equal(result.code, 0);
  assert.equal(fs.readFileSync(result.outputPath, 'utf8').length, 50000);
  fs.rmSync(root, { recursive: true, force: true });
});
