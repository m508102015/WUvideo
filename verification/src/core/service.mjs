import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { rawPath } from './log.mjs';
import { redactText } from './redact.mjs';

export async function waitForUrl(url, timeoutMs = 60_000, stopped = () => '') {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    const stopReason = stopped();
    if (stopReason) return { ok: false, error: stopReason };
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      if (response.status < 500) return { ok: true, status: response.status };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, error: lastError };
}

function exitReason(service) {
  if (!service.exit) return '';
  if (service.exit.error) return `process failed before readiness: ${service.exit.error}`;
  return `process exited before readiness: code ${service.exit.code ?? 'null'}, signal ${service.exit.signal || 'none'}`;
}

export async function startProcess(ctx, name, command, args, options = {}) {
  const outputPath = rawPath(ctx, `${name}.log`);
  const stream = fs.createWriteStream(outputPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd: options.cwd || ctx.config.root,
    env: { ...process.env, ...(options.env || {}) },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = new StringDecoder('utf8');
  const stderr = new StringDecoder('utf8');
  const append = (value) => { const safe = redactText(value); if (safe) stream.write(safe); };
  child.stdout.on('data', (chunk) => append(stdout.write(chunk)));
  child.stderr.on('data', (chunk) => append(stderr.write(chunk)));
  let finishOutput;
  const done = new Promise((resolve) => { finishOutput = resolve; });
  const service = { name, child, outputPath, stopped: false, exit: null, done };
  child.once('error', (error) => { service.exit = { error: error.message }; });
  child.once('close', (code, signal) => {
    service.exit = { code, signal };
    append(stdout.end()); append(stderr.end());
    stream.end(finishOutput);
  });
  ctx.services.push(service);
  if (options.url) {
    service.ready = await waitForUrl(options.url, options.timeoutMs, () => exitReason(service));
    if (service.ready.ok) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const reason = exitReason(service);
      if (reason) service.ready = { ok: false, error: reason };
    }
  }
  return service;
}

export function stopProcess(service) {
  if (!service?.child?.pid || service.stopped) return;
  service.stopped = true;
  try {
    process.kill(-service.child.pid, 'SIGTERM');
  } catch {
    try { service.child.kill('SIGTERM'); } catch { /* already stopped */ }
  }
}

export function stopAll(ctx) {
  for (const service of [...ctx.services].reverse()) {
    if (typeof service.close === 'function') service.close();
    else stopProcess(service);
  }
}
