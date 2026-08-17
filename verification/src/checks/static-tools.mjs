import fs from 'node:fs';
import path from 'node:path';
import { runCommand, runNpm } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { checkCoverage } from './coverage.mjs';

// GH-ISSUE: 80,140,150,174; GH-PR: 5,47,235

function commandFinding(ctx, result, options) {
  const { id, title, severity, expected = 'exit code 0' } = options;
  const ok = result.code === 0 && !result.timedOut;
  finding(ctx, {
    id, category: 'static', title, status: ok ? 'PASS' : 'FAIL', severity, expected,
    actual: result.timedOut ? `timed out after ${result.durationMs}ms` : `exit code ${result.code}`,
    reason: ok ? 'The command completed successfully.' : 'The authoritative project command failed; the raw output contains exact diagnostics.',
    impact: ok ? '' : result.tail.slice(-2000), evidence: [result.outputPath],
    remediation: 'Resolve every diagnostic in the raw output, then rerun the complete chain.', durationMs: result.durationMs,
  });
  return ok;
}

export async function checkStaticTools(ctx) {
  const test = await runCommand(ctx, 'npm-test-regression', process.execPath,
    [path.join(ctx.config.verifyDir, 'src', 'run-regression.mjs')]);
  ctx.state.testsOk = commandFinding(ctx, test, { id: 'static.unit-tests', title: 'Repository unit tests pass', severity: 'critical' });
  await checkCoverage(ctx);
  const lint = await runNpm(ctx, 'npm-lint', ['run', 'lint']);
  ctx.state.lintOk = commandFinding(ctx, lint, { id: 'static.eslint', title: 'ESLint reports no errors or warnings', severity: 'high' });
  const types = await runCommand(ctx, 'typescript', 'npx', ['--no-install', 'tsc', '--noEmit', '--incremental', 'false']);
  ctx.state.typesOk = commandFinding(ctx, types, { id: 'static.typescript', title: 'Full TypeScript check passes', severity: 'high' });
  const integrity = await runNpm(ctx, 'npm-ls', ['ls', '--all', '--json']);
  commandFinding(ctx, integrity, { id: 'static.dependency-integrity', title: 'Installed dependency graph is valid', severity: 'high' });
  if (!ctx.config.offline) await checkAudit(ctx);
  else finding(ctx, {
    id: 'static.npm-audit', category: 'static', title: 'Dependency vulnerability audit', status: 'SKIP', severity: 'high',
    expected: 'Online npm audit', actual: '--offline', reason: 'The run explicitly disabled network checks.', remediation: 'Rerun without --offline.',
  });
  if (!ctx.config.quick) {
    const pages = await runCommand(ctx, 'cloudflare-pages-build', 'npx', ['--yes', 'npm@10.9.3', 'run', 'pages:build'], {
      timeoutMs: ctx.config.commandTimeoutMs, env: { npm_config_package_lock: 'false', npm_config_save: 'false' },
    });
    ctx.state.pagesBuildOk = commandFinding(ctx, pages, { id: 'static.cloudflare-build', title: 'Cloudflare Pages build succeeds', severity: 'critical' });
  }
  const build = await runNpm(ctx, 'next-build', ['run', 'build'], { timeoutMs: ctx.config.commandTimeoutMs });
  ctx.state.buildOk = commandFinding(ctx, build, { id: 'static.production-build', title: 'Production Next.js build succeeds', severity: 'critical' });
}

async function checkAudit(ctx) {
  const result = await runNpm(ctx, 'npm-audit', ['audit', '--omit=dev', '--json']);
  let audit = null;
  try { audit = JSON.parse(fs.readFileSync(result.outputPath, 'utf8')); } catch { /* malformed audit output */ }
  const vulnerabilities = audit?.metadata?.vulnerabilities || {};
  const severe = (vulnerabilities.critical || 0) + (vulnerabilities.high || 0);
  const ok = result.code === 0 && severe === 0;
  finding(ctx, {
    id: 'static.npm-audit', category: 'security', title: 'Production dependencies have no known high/critical vulnerabilities',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: '0 high and 0 critical vulnerabilities',
    actual: audit ? JSON.stringify(vulnerabilities) : `unparseable output; exit ${result.code}`,
    reason: ok ? 'npm advisory data reports no severe production vulnerability.' : 'The dependency audit failed or reports severe vulnerabilities.',
    evidence: [result.outputPath], remediation: 'Upgrade, replace, or explicitly mitigate every severe advisory.', durationMs: result.durationMs,
  });
}
