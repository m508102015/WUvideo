import fs from 'node:fs';
import path from 'node:path';

const ignoredDirectories = new Set([
  '.git', '.gradle', '.next', '.vercel', '.wrangler',
  'artifacts', 'build', 'cache', 'coverage', 'dist', 'node_modules', 'out',
]);
const ignoredRootFiles = new Set(['README.md', 'next-env.d.ts', 'npm-debug.log']);

export function includeDockerContextPath(root, source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const parts = relative.split(path.sep);
  if (parts[0] === 'verification') return false;
  if (parts.some((part) => ignoredDirectories.has(part))) return false;
  if (parts.length === 1 && ignoredRootFiles.has(parts[0])) return false;
  return !parts.at(-1).endsWith('.tsbuildinfo');
}

export function createDockerContext(ctx) {
  const root = ctx.config.root;
  const target = path.join(ctx.config.verifyDir, 'cache', `docker-context-${ctx.runId}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(root)) {
    const source = path.join(root, name);
    if (!includeDockerContextPath(root, source)) continue;
    fs.cpSync(source, path.join(target, name), {
      recursive: true,
      filter: (candidate) => includeDockerContextPath(root, candidate),
    });
  }
  return target;
}

export function removeDockerContext(target) {
  fs.rmSync(target, { recursive: true, force: true });
}
