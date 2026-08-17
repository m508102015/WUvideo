import fs from 'node:fs';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';

function parse(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

export function auditArgs() {
  return ['audit', '--omit=dev', '--audit-level=high', '--json'];
}

export async function checkHarnessDependencies(ctx) {
  const cwd = ctx.config.verifyDir;
  const tree = await runCommand(ctx, 'verification-dependencies', 'npm', ['ls', '--all', '--json'], { cwd, timeoutMs: 60_000 });
  finding(ctx, {
    id: 'harness.dependency-integrity', category: 'harness', title: 'Verification dependencies exactly match their lockfile',
    status: tree.code === 0 ? 'PASS' : 'FAIL', severity: 'critical', expected: 'npm ls exit 0', actual: `exit ${tree.code}`,
    reason: tree.code === 0 ? 'The verifier runs with a complete pinned dependency graph.' : 'Missing, invalid, or extraneous verifier dependencies make results non-reproducible.',
    evidence: [tree.outputPath], remediation: 'Repair verification/package.json and its lockfile, then rerun npm ci.', durationMs: tree.durationMs,
  });
  if (ctx.config.offline) return finding(ctx, {
    id: 'harness.dependency-audit', category: 'harness', title: 'Verification dependencies have no severe advisory',
    status: 'SKIP', severity: 'high', expected: 'Online npm audit', actual: '--offline', reason: 'The run explicitly disabled network checks.', remediation: 'Rerun online.',
  });
  const audit = await runCommand(ctx, 'verification-audit', 'npm', auditArgs(), { cwd, timeoutMs: 120_000 });
  const body = parse(audit.outputPath);
  const counts = body?.metadata?.vulnerabilities || null;
  const severe = (counts?.high || 0) + (counts?.critical || 0);
  const ok = audit.code === 0 && counts && severe === 0;
  finding(ctx, {
    id: 'harness.dependency-audit', category: 'harness', title: 'Verification dependencies have no high or critical advisory',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: '0 high and 0 critical vulnerabilities',
    actual: counts ? JSON.stringify(counts) : `unparseable output; exit ${audit.code}`,
    reason: ok ? 'The verifier dependency graph has no known severe advisory.' : 'The verification framework itself has a severe dependency risk or an incomplete audit.',
    evidence: [audit.outputPath], remediation: 'Upgrade or replace the affected pinned verifier dependency.', durationMs: audit.durationMs,
  });
}
