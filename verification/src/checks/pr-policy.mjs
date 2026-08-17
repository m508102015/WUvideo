import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { evaluatePrEvidence } from '../policy/pr-evidence.mjs';

export async function checkPrPolicy(ctx) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let event = null;
  try { if (eventPath) event = JSON.parse(fs.readFileSync(eventPath, 'utf8')); } catch { /* reported below */ }
  if (!event?.pull_request) return finding(ctx, {
    id: 'policy.pr-regression-evidence', category: 'policy', title: 'Pull requests declare regression evidence',
    status: 'SKIP', severity: 'high', expected: 'GitHub pull_request event', actual: eventPath ? 'Non-PR or invalid event' : 'Local/non-PR run',
    reason: 'PR-body policy only applies when a pull-request event fixture is supplied.',
    remediation: 'Use verification/history/pr-evidence-template.md when preparing pull-request evidence.',
  });
  const base = event.pull_request.base?.sha;
  const head = event.pull_request.head?.sha;
  const diff = await runCommand(ctx, 'pr-changed-files', 'git', ['diff', '--name-only', `${base}...${head}`], { timeoutMs: 60_000 });
  const changedFiles = diff.code === 0 ? diff.tail.split(/\r?\n/).filter(Boolean) : [];
  const result = diff.code === 0
    ? evaluatePrEvidence(ctx.config.root, changedFiles, event.pull_request.body || '')
    : { ok: false, errors: [`git diff failed with exit ${diff.code}`], codeFiles: [], parsed: {} };
  const target = path.join(ctx.dirs.raw, 'pr-regression-evidence.json');
  writeJson(target, { pullRequest: event.pull_request.number, base, head, changedFiles, result });
  finding(ctx, {
    id: 'policy.pr-regression-evidence', category: 'policy', title: 'Pull requests declare regression evidence',
    status: result.ok ? 'PASS' : 'FAIL', severity: 'critical', expected: 'Historical-Refs plus valid executable Regression-Evidence for code changes',
    actual: result.ok ? `${result.codeFiles.length} code/config files covered` : JSON.stringify(result.errors),
    reason: result.ok ? 'The PR names checkable regression proof and directly traces declared historical records.' : 'The PR can change behavior without reviewable regression proof.',
    evidence: [target, diff.outputPath], remediation: 'Complete the local template fields, add executable evidence, and tag every declared historical item.',
  });
}
