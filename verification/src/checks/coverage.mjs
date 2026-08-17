import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';

const metrics = ['lines', 'functions', 'branches', 'statements'];

export function coverageArgs(ctx, reportDir) {
  const sources = ['app', 'components', 'lib', 'scripts'];
  const args = ['--all', '--clean', '--100', '--exclude-after-remap'];
  for (const source of sources) args.push('--src', source);
  for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) args.push('--extension', extension);
  args.push('--exclude', '**/*.d.ts', '--exclude', 'verification/tests/**', '--exclude', 'verification/tmp/**',
    '--reporter', 'json-summary', '--reporter', 'html', '--reports-dir', reportDir,
    process.execPath, path.join(ctx.config.verifyDir, 'src', 'run-regression.mjs'),
    '--output-dir', path.join(reportDir, 'bundle'));
  return args;
}

function readSummary(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

export async function checkCoverage(ctx) {
  const reportDir = path.join(ctx.dirs.metrics, 'coverage');
  const c8 = path.join(ctx.config.verifyDir, 'node_modules', '.bin', 'c8');
  const result = await runCommand(ctx, 'coverage', c8, coverageArgs(ctx, reportDir), {
    cwd: ctx.config.root, timeoutMs: ctx.config.commandTimeoutMs,
  });
  const summaryFile = path.join(reportDir, 'coverage-summary.json');
  const summary = readSummary(summaryFile);
  const total = summary?.total || null;
  const percentages = Object.fromEntries(metrics.map((name) => [name, Number(total?.[name]?.pct)]));
  const below = metrics.filter((name) => !Number.isFinite(percentages[name]) || percentages[name] < ctx.config.coveragePercent);
  const ok = result.code === 0 && below.length === 0;
  finding(ctx, {
    id: 'static.code-coverage', category: 'coverage', title: 'Executable application code has complete regression coverage',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical',
    expected: `${ctx.config.coveragePercent}% lines, functions, branches, and statements across app/components/lib/scripts`,
    actual: summary ? JSON.stringify({ percentages, below }) : `coverage report missing; exit ${result.code}`,
    reason: ok ? 'Every instrumentable application statement, branch, function, and line is covered by the local regression suite.'
      : 'One or more application coverage dimensions are below the strict threshold or coverage collection failed.',
    impact: below.length ? `Below threshold: ${below.join(', ')}` : '',
    evidence: [result.outputPath, summaryFile, path.join(reportDir, 'index.html')],
    remediation: 'Add focused local regressions for every uncovered range; do not lower the threshold or exclude business code.',
    durationMs: result.durationMs,
  });
}
