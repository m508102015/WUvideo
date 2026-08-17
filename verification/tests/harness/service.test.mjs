import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startProcess } from '../../src/core/service.mjs';

async function listeningServer() {
  const server = http.createServer((_request, response) => response.end('stale'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('a stale reachable URL cannot hide a failed service process', async () => {
  const server = await listeningServer();
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-service-'));
  const ctx = { config: { root, commandTimeoutMs: 2000 }, dirs: { raw: root }, services: [] };
  try {
    const service = await startProcess(ctx, 'stale-port', process.execPath, ['-e', 'process.exit(7)'], {
      url: `http://127.0.0.1:${address.port}`, timeoutMs: 2000,
    });
    assert.equal(service.ready.ok, false);
    assert.match(service.ready.error, /process exited before readiness/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
