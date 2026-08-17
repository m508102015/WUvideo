import fs from 'node:fs';
import path from 'node:path';
import { relative, walk } from '../core/files.mjs';

function numbers(text) {
  return (text.match(/\d+/g) || []).map(Number);
}

function add(map, number, file) {
  const files = map.get(number) || [];
  if (!files.includes(file)) files.push(file);
  map.set(number, files);
}

function tags(text, name) {
  const pattern = new RegExp(`GH-${name}:\\s*([^;\\n]+)`, 'g');
  return [...text.matchAll(pattern)].flatMap((match) => numbers(match[1]));
}

export function collectTraceability(root, catalog) {
  const issues = new Map();
  const pullRequests = new Map();
  const verifyDir = path.join(root, 'verification');
  const files = walk(verifyDir, (file) => {
    const normalized = file.split(path.sep).join('/');
    return normalized.includes('/src/checks/') || normalized.includes('/tests/regression/');
  }).map((file) => relative(root, file)).sort();
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const number of tags(text, 'ISSUE')) add(issues, number, file);
    for (const number of tags(text, 'PR')) add(pullRequests, number, file);
  }
  const validIssues = new Set(catalog.issues);
  const validPrs = new Set([...catalog.pullRequests, ...catalog.unavailablePullRequests]);
  const unknown = [
    ...[...issues].filter(([number]) => !validIssues.has(number)).map(([number, files]) => ({ kind: 'issue', number, files })),
    ...[...pullRequests].filter(([number]) => !validPrs.has(number)).map(([number, files]) => ({ kind: 'pullRequest', number, files })),
  ];
  return { issues, pullRequests, unknown };
}

export function traceFiles(trace, kind, number) {
  return [...(trace[kind].get(number) || [])];
}
