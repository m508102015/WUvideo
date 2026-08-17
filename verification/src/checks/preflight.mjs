import fs from 'node:fs';
import path from 'node:path';
import { runCommand, runNpm } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { readJson } from '../core/files.mjs';

function major(version) {
  return Number(String(version).replace(/^v/, '').split('.')[0]);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

export function verificationChange(line) {
  const file = line.slice(3).split(' -> ').pop();
  return file.startsWith('verification/');
}

export async function checkWorkspaceBoundary(ctx, phase = 'preflight') {
  const git = await runCommand(ctx, `git-status-${phase}`, 'git', ['status', '--porcelain=v1'], { timeoutMs: 30_000 });
  const outside = git.tail.split('\n').filter(Boolean).filter((line) => !verificationChange(line));
  finding(ctx, {
    id: `${phase}.business-tree`, category: phase, title: 'Business source tree has no unrelated edits',
    status: outside.length ? 'FAIL' : 'PASS', severity: 'high', expected: 'No changes outside verification/',
    actual: outside.length ? outside.join('\n') : 'clean',
    reason: outside.length ? 'A command changed files outside the authorized verification boundary.' : 'Only the validation scope is changed.',
    evidence: [git.outputPath], remediation: 'Move generated state below verification/ and restore every outside path.',
  });
}

export async function checkPreflight(ctx) {
  const pkg = readJson(path.join(ctx.config.root, 'package.json'));
  const release = readJson(path.join(ctx.config.root, 'app-release.json'));
  const versionsMatch = pkg.version === release.currentVersion && pkg.version === release.releases?.[0]?.version;
  finding(ctx, {
    id: 'preflight.version-consistency', category: 'preflight', title: 'Local version metadata agrees',
    status: versionsMatch ? 'PASS' : 'FAIL', severity: 'high', expected: 'package.json, currentVersion, and first release match',
    actual: JSON.stringify({ package: pkg.version, current: release.currentVersion, release: release.releases?.[0]?.version }),
    reason: versionsMatch ? 'All local release sources agree.' : 'Release sources disagree and can publish ambiguous artifacts.',
    remediation: 'Update all version sources atomically before release.',
  });
  const nodeMajor = major(process.version);
  finding(ctx, {
    id: 'preflight.node', category: 'preflight', title: 'Node.js runtime is supported',
    status: nodeMajor >= 20 && nodeMajor <= 26 ? 'PASS' : 'WARN', severity: 'medium', expected: 'Node.js 20 through 26',
    actual: process.version, reason: nodeMajor >= 20 && nodeMajor <= 26 ? 'Runtime is within the tested range.' : 'Runtime is outside the declared range.',
    remediation: 'Use an LTS version supported by Next.js and the repository.',
  });
  const install = await runNpm(ctx, 'npm-ci-root', ['ci', '--no-audit', '--no-fund'], { timeoutMs: ctx.config.commandTimeoutMs });
  finding(ctx, {
    id: 'preflight.root-dependencies', category: 'preflight', title: 'Root dependencies exactly match package-lock.json',
    status: install.code === 0 ? 'PASS' : 'FAIL', severity: 'critical', expected: 'npm ci exit 0', actual: `exit ${install.code}`,
    reason: install.code === 0 ? 'The project commands run against a deterministic dependency tree.' : 'Tests against stale or partial dependencies are not authoritative.',
    evidence: [install.outputPath], remediation: 'Repair package.json/package-lock.json or registry access, then rerun.', durationMs: install.durationMs,
  });
  const chrome = findChrome();
  finding(ctx, {
    id: 'preflight.chrome', category: 'preflight', title: 'Chrome executable is available',
    status: chrome ? 'PASS' : 'FAIL', severity: 'high', expected: 'Chrome on macOS or Linux', actual: chrome,
    reason: chrome ? 'UI checks can launch an isolated browser.' : 'UI checks cannot launch the required browser.',
    remediation: 'Install Google Chrome or configure a supported executable.',
  });
  ctx.state.chromePath = chrome;
  await checkWorkspaceBoundary(ctx);
}
