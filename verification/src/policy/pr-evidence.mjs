import fs from 'node:fs';
import path from 'node:path';

const codeExtensions = new Set([
  '.css', '.gradle', '.js', '.jsx', '.json', '.kts', '.kt', '.mjs', '.sh', '.ts', '.tsx', '.yaml', '.yml',
]);
const evidencePrefixes = [
  'verification/src/checks/',
  'verification/tests/harness/',
  'verification/tests/regression/',
];

function fieldValues(body, name) {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, 'gim');
  return [...body.matchAll(pattern)].flatMap((match) => match[1].split(',')).map((item) => item.trim()).filter(Boolean);
}

export function parsePrBody(body = '') {
  const historical = fieldValues(body, 'Historical-Refs');
  const evidence = fieldValues(body, 'Regression-Evidence');
  const reasons = fieldValues(body, 'Regression-Evidence-Reason');
  const refs = historical.flatMap((value) => {
    if (/^none$/i.test(value)) return [];
    const explicitPrs = [...value.matchAll(/PR\s*#(\d+)/gi)].map((match) => ({ kind: 'PR', number: Number(match[1]) }));
    const withoutPrs = value.replace(/PR\s*#\d+/gi, '');
    const issues = [...withoutPrs.matchAll(/#(\d+)/g)].map((match) => ({ kind: 'ISSUE', number: Number(match[1]) }));
    return [...explicitPrs, ...issues];
  });
  return { historical, evidence, reasons, refs };
}

export function isCodeChange(file) {
  const base = path.basename(file);
  return codeExtensions.has(path.extname(file)) || ['Dockerfile', 'package-lock.json', 'package.json'].includes(base);
}

function tagged(text, ref) {
  const pattern = new RegExp(`GH-${ref.kind}:\\s*([^;\\n]+)`, 'g');
  return [...text.matchAll(pattern)].some((match) => (match[1].match(/\d+/g) || []).map(Number).includes(ref.number));
}

export function evaluatePrEvidence(root, changedFiles, body) {
  const parsed = parsePrBody(body);
  const codeFiles = changedFiles.filter(isCodeChange);
  if (!codeFiles.length) return { ok: true, codeFiles, parsed, errors: [] };
  const errors = [];
  if (!parsed.historical.length) errors.push('Historical-Refs is required; use none only after checking history.');
  if (!parsed.evidence.length) errors.push('At least one Regression-Evidence path is required.');
  const evidence = [];
  for (const file of parsed.evidence) {
    const normalized = file.split(path.sep).join('/');
    const allowed = evidencePrefixes.some((prefix) => normalized.startsWith(prefix));
    const absolute = path.resolve(root, normalized);
    if (!allowed || !absolute.startsWith(`${path.resolve(root)}${path.sep}`)) errors.push(`Disallowed evidence path: ${file}`);
    else if (!fs.existsSync(absolute)) errors.push(`Evidence path does not exist: ${file}`);
    else evidence.push({ file: normalized, text: fs.readFileSync(absolute, 'utf8') });
  }
  const evidenceChanged = evidence.some((item) => changedFiles.includes(item.file));
  if (evidence.length && !evidenceChanged && !parsed.reasons.some((reason) => reason.length >= 20)) {
    errors.push('Unchanged evidence requires a specific Regression-Evidence-Reason of at least 20 characters.');
  }
  for (const ref of parsed.refs) {
    if (!evidence.some((item) => tagged(item.text, ref))) errors.push(`No evidence file directly tags GH-${ref.kind} #${ref.number}.`);
  }
  return { ok: errors.length === 0, codeFiles, parsed, evidence: evidence.map((item) => item.file), errors };
}
