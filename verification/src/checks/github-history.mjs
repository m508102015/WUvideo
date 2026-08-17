import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { loadHistoryCatalog } from '../history/catalog.mjs';
import { createGithubAudit } from '../history/audit.mjs';
import { fetchGithubHistory } from '../history/github.mjs';
import { collectTraceability } from '../history/trace.mjs';
import { addGithubAuditFindings } from './github-audit-findings.mjs';
import { checkLocalHistory } from './history-local.mjs';

function remoteFailure(ctx, remote, evidence) {
  finding(ctx, {
    id: 'history.remote-snapshot', category: 'history', title: 'Remote GitHub maintenance audit completes',
    status: 'FAIL', severity: 'critical', expected: 'Complete valid GitHub responses', actual: remote.error,
    reason: 'The explicitly requested remote audit could not prove a complete response set.',
    evidence, remediation: 'Restore gh authentication or network access and rerun --audit-github.',
  });
}

export async function checkGithubHistory(ctx) {
  await checkLocalHistory(ctx);
  if (ctx.config.offline) return finding(ctx, {
    id: 'history.remote-snapshot', category: 'history', title: 'Remote GitHub maintenance audit completes',
    status: 'SKIP', severity: 'high', expected: 'Online audit', actual: '--offline',
    reason: 'The caller requested both --audit-github and --offline.',
    evidence: [path.join(ctx.config.verifyDir, 'history')], remediation: 'Remove --offline to run the explicit maintenance audit.',
  });
  const loaded = loadHistoryCatalog(ctx.config.root);
  const trace = collectTraceability(ctx.config.root, loaded.catalog);
  const remote = await fetchGithubHistory(ctx);
  const commandEvidence = remote.commands.map((item) => item.outputPath);
  if (remote.error) return remoteFailure(ctx, remote, commandEvidence);
  const currentPr = Number(process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1]) || null;
  const audit = createGithubAudit(remote, loaded.catalog, trace, currentPr);
  const target = path.join(ctx.dirs.metrics, 'github-history.json');
  writeJson(target, { inventoryDelta: audit.inventoryDelta, coverageDelta: audit.coverageDelta,
    uncataloged: audit.uncataloged, truncation: audit.truncation, digests: audit.normalized.digests,
    issues: audit.issues, pullRequests: audit.pullRequests, data: audit.normalized.data });
  addGithubAuditFindings(ctx, { audit, ...loaded, evidence: [target, ...commandEvidence] });
}
