import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDockerContext, includeDockerContextPath, removeDockerContext } from '../../src/checks/docker-context.mjs';

test('Docker context contains application inputs but excludes verifier state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-docker-context-'));
  const verifyDir = path.join(root, 'verification');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(verifyDir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM scratch\n');
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export {};\n');
  fs.writeFileSync(path.join(verifyDir, 'artifacts', 'large.bin'), 'excluded');
  fs.writeFileSync(path.join(root, 'node_modules', 'dependency.js'), 'excluded');
  const context = createDockerContext({ config: { root, verifyDir }, runId: 'unit' });
  assert.equal(fs.existsSync(path.join(context, 'Dockerfile')), true);
  assert.equal(fs.existsSync(path.join(context, 'src', 'app.js')), true);
  assert.equal(fs.existsSync(path.join(context, 'verification')), false);
  assert.equal(fs.existsSync(path.join(context, 'node_modules')), false);
  removeDockerContext(context);
  assert.equal(fs.existsSync(context), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Docker context rejects paths outside the root', () => {
  const root = path.join(os.tmpdir(), 'kvideo-root');
  assert.equal(includeDockerContextPath(root, path.join(root, 'src', 'app.js')), true);
  assert.equal(includeDockerContextPath(root, path.join(root, 'verification', 'run')), false);
  assert.equal(includeDockerContextPath(root, path.join(root, '..', 'secret')), false);
});
