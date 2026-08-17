import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact.mjs';

const ignored = new Set(['.git', '.gradle', '.next', '.vercel', '.wrangler', 'artifacts', 'build', 'cache', 'coverage', 'dist', 'node_modules', 'out']);

export function walk(root, predicate = () => true) {
  const output = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (predicate(full)) output.push(full);
    }
  };
  visit(root);
  return output;
}

export function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(redact(value), null, 2));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
