import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import { finding } from '../core/finding.mjs';
import { relative, walk, writeJson } from '../core/files.mjs';
import { children } from './ast-walk.mjs';

// GH-PR: 235

const textExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.toml', '.md']);
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\bgh[opusr]_[A-Za-z0-9_]{20,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['generic-secret-assignment', /(?:secret|token|password|api[_-]?key)\s*[:=]\s*['"][^'"\n]{12,}['"]/i],
];

export function findDangerousConstructs(file, text) {
  const ast = parse(text, {
    jsx: file.endsWith('.tsx') || file.endsWith('.jsx'),
    errorOnUnknownASTType: false,
  });
  const constructs = new Set();
  const visit = (node) => {
    if (node.type === 'JSXAttribute' && node.name?.name === 'dangerouslySetInnerHTML') {
      constructs.add('dangerouslySetInnerHTML');
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'eval') {
      constructs.add('eval');
    }
    for (const child of children(node)) visit(child);
  };
  visit(ast);
  return [...constructs].map((construct) => ({ file, construct }));
}

export async function checkSecurityScan(ctx) {
  const files = walk(ctx.config.root, (file) => textExt.has(path.extname(file)) && !file.includes('/verification/artifacts/'));
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [name, pattern] of patterns) if (pattern.test(line)) hits.push({ file: relative(ctx.config.root, file), line: index + 1, pattern: name });
    });
  }
  const target = path.join(ctx.dirs.metrics, 'secret-scan.json');
  writeJson(target, hits);
  finding(ctx, {
    id: 'security.static-secrets', category: 'security', title: 'Repository contains no obvious committed secrets',
    status: hits.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 credential-pattern matches',
    actual: hits.length ? JSON.stringify(hits) : '0',
    reason: hits.length ? 'Credential-like material appears in repository text. Values are intentionally omitted from logs.' : 'No configured credential signature was found.',
    evidence: [target], remediation: 'Remove and rotate confirmed credentials; replace false positives with safe fixtures.',
  });
  const dangerous = files.filter((file) => ['.ts', '.tsx', '.js', '.mjs'].includes(path.extname(file))).flatMap((file) => {
    return findDangerousConstructs(relative(ctx.config.root, file), fs.readFileSync(file, 'utf8'));
  });
  finding(ctx, {
    id: 'security.dangerous-constructs', category: 'security', title: 'Dangerous runtime constructs are inventoried',
    status: dangerous.length ? 'WARN' : 'PASS', severity: 'medium', expected: 'No eval or unreviewed raw HTML injection', actual: JSON.stringify(dangerous),
    reason: dangerous.length ? 'These constructs expand injection risk and require contextual review.' : 'No configured dangerous construct was found.',
    remediation: 'Verify sanitization and replace raw execution or HTML injection where possible.',
  });
}
