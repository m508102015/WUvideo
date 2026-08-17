import fs from 'node:fs';
import path from 'node:path';
import { redact, redactText } from './redact.mjs';

export function log(ctx, level, event, message, data = {}) {
  const entry = {
    at: new Date().toISOString(),
    level,
    event,
    message: redactText(message),
    data: redact(data),
  };
  ctx.events.push(entry);
  fs.appendFileSync(path.join(ctx.artifacts, 'events.ndjson'), `${JSON.stringify(entry)}\n`);
  const suffix = Object.keys(entry.data).length ? ` ${JSON.stringify(entry.data)}` : '';
  fs.appendFileSync(
    path.join(ctx.artifacts, 'run.log'),
    `${entry.at} ${level.toUpperCase()} ${event} ${entry.message}${suffix}\n`,
  );
  process.stdout.write(`[${level.toUpperCase()}] ${entry.message}\n`);
}

export function rawPath(ctx, name) {
  return path.join(ctx.dirs.raw, name.replace(/[^a-zA-Z0-9_.-]+/g, '-'));
}
