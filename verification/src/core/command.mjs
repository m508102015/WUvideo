import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { rawPath } from './log.mjs';
import { redactText } from './redact.mjs';

function terminate(child, signal) {
  if (!child.pid || child.killed) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* process already ended */ }
  }
}

export function runCommand(ctx, name, command, args = [], options = {}) {
  const started = Date.now();
  const outputPath = rawPath(ctx, `${name}.log`);
  const stream = fs.createWriteStream(outputPath, { flags: 'w' });
  const env = { ...process.env, ...(options.env || {}) };
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ctx.config.root,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    let timedOut = false;
    let settled = false;
    let flushed = false;
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const append = (text) => {
      if (!text) return;
      const safe = redactText(text);
      stream.write(safe);
      tail = `${tail}${safe}`.slice(-12_000);
      if (options.live) process.stdout.write(safe);
    };
    const flush = () => {
      if (flushed) return;
      flushed = true;
      append(stdoutDecoder.end());
      append(stderrDecoder.end());
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      flush();
      result.tail = tail;
      stream.end(() => resolve(result));
    };
    child.stdout.on('data', (chunk) => append(stdoutDecoder.write(chunk)));
    child.stderr.on('data', (chunk) => append(stderrDecoder.write(chunk)));
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate(child, 'SIGTERM');
      setTimeout(() => terminate(child, 'SIGKILL'), 3000).unref();
    }, options.timeoutMs || ctx.config.commandTimeoutMs);
    child.on('error', (error) => {
      finish({ code: 127, error: error.message, tail, outputPath, timedOut, durationMs: Date.now() - started });
    });
    child.on('close', (code, signal) => {
      finish({ code: code ?? 1, signal, tail, outputPath, timedOut, durationMs: Date.now() - started });
    });
  });
}

export async function runNpm(ctx, name, args, options = {}) {
  return runCommand(ctx, name, 'npm', args, options);
}
