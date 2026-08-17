import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import { finding } from '../core/finding.mjs';
import { relative, walk, writeJson } from '../core/files.mjs';
import { collectFunctions } from './ast-walk.mjs';

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export async function checkAstMetrics(ctx) {
  const files = walk(ctx.config.root, (file) => extensions.has(path.extname(file)) && !file.includes('/verification/'));
  const metrics = [];
  const parseErrors = [];
  for (const file of files) {
    try {
      const ast = parse(fs.readFileSync(file, 'utf8'), { loc: true, jsx: /\.[jt]sx$/.test(file), errorOnUnknownASTType: false });
      const functions = collectFunctions(ast);
      metrics.push({ file: relative(ctx.config.root, file), functions });
    } catch (error) {
      parseErrors.push({ file: relative(ctx.config.root, file), error: error instanceof Error ? error.message : String(error) });
    }
  }
  const offenders = metrics.flatMap((item) => item.functions.map((fn) => ({ file: item.file, ...fn })))
    .filter((fn) => fn.lines > 80 || fn.complexity > 15 || fn.maxNesting > 4 || fn.params > 5)
    .sort((a, b) => (b.complexity + b.lines / 10) - (a.complexity + a.lines / 10));
  const target = path.join(ctx.dirs.metrics, 'ast-metrics.json');
  writeJson(target, { parseErrors, offenders, files: metrics });
  finding(ctx, {
    id: 'quality.ast-parse', category: 'quality', title: 'JavaScript and TypeScript source is structurally analyzable',
    status: parseErrors.length ? 'FAIL' : 'PASS', severity: 'high', expected: 'All JS/JSX/MJS/CJS/TS/TSX files parse',
    actual: parseErrors.length ? JSON.stringify(parseErrors.slice(0, 20)) : `${files.length} files parsed`,
    reason: parseErrors.length ? 'Unparseable files invalidate structural quality metrics.' : 'AST metrics cover every authored JavaScript and TypeScript file.',
    evidence: [target], remediation: 'Fix syntax/parser incompatibilities before relying on complexity results.',
  });
  finding(ctx, {
    id: 'quality.spaghetti-risk', category: 'quality', title: 'Functions stay within complexity and cohesion limits',
    status: offenders.length ? 'FAIL' : 'PASS', severity: 'high', expected: 'lines <=80, complexity <=15, nesting <=4, params <=5',
    actual: offenders.length ? `${offenders.length} risky functions; worst: ${JSON.stringify(offenders.slice(0, 12))}` : 'No threshold breaches',
    reason: offenders.length ? 'Long, branch-heavy, deeply nested functions are concrete spaghetti-code indicators.' : 'No configured structural risk threshold was exceeded.',
    evidence: [target], remediation: 'Extract cohesive functions and replace nested conditionals with explicit domain operations.',
  });
}
