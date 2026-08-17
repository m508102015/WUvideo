import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import { findCycles } from '../core/cycles.mjs';
import { finding } from '../core/finding.mjs';
import { relative, walk, writeJson } from '../core/files.mjs';
import { collectFunctions } from './ast-walk.mjs';

const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

function sourceFiles(ctx) {
  return walk(ctx.config.verifyDir, (file) => ['.mjs', '.ts'].includes(path.extname(file))
    && !file.includes('/node_modules/') && !file.includes('/artifacts/') && !file.includes('/tmp/'));
}

function metricsFor(ctx, files) {
  const parsed = [];
  const errors = [];
  for (const file of files) {
    try {
      const ast = parse(fs.readFileSync(file, 'utf8'), { loc: true, jsx: false, errorOnUnknownASTType: false });
      parsed.push({ file: relative(ctx.config.root, file), functions: collectFunctions(ast) });
    } catch (error) {
      errors.push({ file: relative(ctx.config.root, file), error: error instanceof Error ? error.message : String(error) });
    }
  }
  const offenders = parsed.flatMap((item) => item.functions.map((fn) => ({ file: item.file, ...fn })))
    .filter((fn) => fn.lines > 80 || fn.complexity > 15 || fn.maxNesting > 4 || fn.params > 5)
    .sort((a, b) => (b.complexity + b.lines / 10) - (a.complexity + a.lines / 10));
  return { parsed, errors, offenders };
}

function resolveImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(file), specifier);
  const candidates = [base, `${base}.mjs`, `${base}.js`, path.join(base, 'index.mjs')];
  return candidates.find((item) => fs.existsSync(item) && fs.statSync(item).isFile()) || null;
}

function importGraph(ctx, files) {
  const known = new Set(files);
  const graph = new Map(files.map((file) => [file, []]));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved && known.has(resolved)) graph.get(file).push(resolved);
    }
  }
  return Object.fromEntries([...graph].map(([file, imports]) => [relative(ctx.config.root, file), imports.map((item) => relative(ctx.config.root, item))]));
}

export async function checkVerifierQuality(ctx) {
  const files = sourceFiles(ctx);
  const metrics = metricsFor(ctx, files);
  const graph = importGraph(ctx, files.filter((file) => file.endsWith('.mjs')));
  const cycles = findCycles(graph);
  const target = path.join(ctx.dirs.metrics, 'verifier-quality.json');
  writeJson(target, { parseErrors: metrics.errors, offenders: metrics.offenders, graph, cycles });
  finding(ctx, {
    id: 'harness.ast-parse', category: 'harness', title: 'Every verification source file is structurally analyzable',
    status: metrics.errors.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 parser errors',
    actual: metrics.errors.length ? JSON.stringify(metrics.errors) : `${files.length} files parsed`,
    reason: metrics.errors.length ? 'Self-analysis is incomplete when verifier source cannot be parsed.' : 'The verifier can structurally inspect all of its own authored code.',
    evidence: [target], remediation: 'Repair every verifier parse failure.',
  });
  finding(ctx, {
    id: 'harness.structural-quality', category: 'harness', title: 'Verification functions satisfy their own complexity limits',
    status: metrics.offenders.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'lines <=80, complexity <=15, nesting <=4, params <=5',
    actual: metrics.offenders.length ? JSON.stringify(metrics.offenders) : 'No threshold breaches',
    reason: metrics.offenders.length ? 'A verifier cannot credibly enforce standards it violates itself.' : 'Verification implementation meets the same function-level quality boundary.',
    evidence: [target], remediation: 'Split each listed verifier function before trusting or publishing it.',
  });
  finding(ctx, {
    id: 'harness.import-cycles', category: 'harness', title: 'Verification module graph has no dependency cycle',
    status: cycles.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 cycles', actual: cycles.length ? cycles.join('\n') : '0',
    reason: cycles.length ? 'Order-dependent verifier initialization can corrupt findings.' : 'The verifier module graph is acyclic.',
    evidence: [target], remediation: 'Extract shared helpers or invert dependencies to remove every cycle.',
  });
}
