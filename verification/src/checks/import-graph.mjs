import fs from 'node:fs';
import path from 'node:path';
import { findCycles } from '../core/cycles.mjs';
import { finding } from '../core/finding.mjs';
import { lineCount, relative, walk, writeJson } from '../core/files.mjs';

const ext = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(root, from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(from), specifier);
  const candidates = [base, ...ext.map((item) => base + item), ...ext.map((item) => path.join(base, `index${item}`))];
  return candidates.find((item) => fs.existsSync(item) && fs.statSync(item).isFile()) || null;
}

function closure(graph, start) {
  const seen = new Set();
  const visit = (node) => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const child of graph.get(node) || []) visit(child);
  };
  visit(start);
  return seen;
}

export async function checkImportGraph(ctx) {
  const root = ctx.config.root;
  const files = walk(root, (file) => ext.includes(path.extname(file)) && !file.includes('/verification/'));
  const graph = new Map(files.map((file) => [relative(root, file), []]));
  const unresolved = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      const resolved = resolveImport(root, file, specifier);
      if (resolved) graph.get(relative(root, file)).push(relative(root, resolved));
      else if (specifier.startsWith('.') || specifier.startsWith('@/')) unresolved.push({ file: relative(root, file), specifier });
    }
  }
  const cycles = findCycles(graph);
  const pages = [...graph.keys()].filter((file) => /(^|\/)app\/.*page\.tsx$/.test(file));
  const features = pages.map((entry) => {
    const reached = closure(graph, entry);
    return { entry, files: reached.size, lines: [...reached].reduce((sum, file) => sum + lineCount(path.join(root, file)), 0) };
  }).sort((a, b) => b.lines - a.lines);
  const target = path.join(ctx.dirs.metrics, 'import-graph.json');
  writeJson(target, { cycles, unresolved, features, graph: Object.fromEntries(graph) });
  finding(ctx, {
    id: 'quality.import-cycles', category: 'quality', title: 'Internal dependency graph has no cycles',
    status: cycles.length ? 'FAIL' : 'PASS', severity: 'high', expected: '0 dependency cycles', actual: cycles.length ? cycles.slice(0, 20).join('\n') : '0',
    reason: cycles.length ? 'Cycles create order-dependent initialization and make feature boundaries unreliable.' : 'No static import cycles were found.',
    evidence: [target], remediation: 'Extract shared contracts or invert dependencies to break each cycle.',
  });
  finding(ctx, {
    id: 'quality.feature-footprint', category: 'quality', title: 'Feature transitive code footprint is quantified',
    status: features.some((item) => item.lines > 10_000) ? 'WARN' : 'PASS', severity: 'medium', expected: 'No page transitively owns more than 10,000 lines',
    actual: JSON.stringify(features), reason: 'Transitive page footprints expose features that accumulate excessive code through dependencies.',
    evidence: [target], remediation: 'Split oversized feature graphs into explicit bounded modules and lazy boundaries.',
  });
}
