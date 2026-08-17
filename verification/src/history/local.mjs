import fs from 'node:fs';
import path from 'node:path';
import { relative, walk } from '../core/files.mjs';
import { traceFiles } from './trace.mjs';

function importedChecks(root) {
  const main = fs.readFileSync(path.join(root, 'verification', 'src', 'main.mjs'), 'utf8');
  const pattern = /from ['"]\.\/checks\/([^'"]+\.mjs)['"]/g;
  return new Set([...main.matchAll(pattern)].map((match) => `verification/src/checks/${match[1]}`));
}

export function executableEvidence(root) {
  const checks = importedChecks(root);
  const tests = walk(path.join(root, 'verification', 'tests', 'regression'), (file) => file.endsWith('.test.ts'))
    .map((file) => relative(root, file));
  return new Set([...checks, ...tests]);
}

function matrix(numbers, kind, trace) {
  return numbers.map((number) => ({ number, files: traceFiles(trace, kind, number) }));
}

export function localCoverage(root, catalog, trace) {
  const runnable = executableEvidence(root);
  const issues = matrix(catalog.regressionIssues || [], 'issues', trace);
  const pullRequests = matrix(catalog.mergedPullRequests || [], 'pullRequests', trace);
  const required = [...issues, ...pullRequests];
  const missing = required.filter((item) => !item.files.length);
  const nonExecutable = required.flatMap((item) => item.files
    .filter((file) => !runnable.has(file)).map((file) => ({ number: item.number, file })));
  return { issues, pullRequests, missing, nonExecutable, unknown: trace.unknown, runnable: [...runnable].sort() };
}
