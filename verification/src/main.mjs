#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.mjs';
import { createContext } from './core/context.mjs';
import { hasFailures } from './core/finding.mjs';
import { log } from './core/log.mjs';
import { runStage } from './core/stage.mjs';
import { stopAll } from './core/service.mjs';
import { writeReports } from './report/write.mjs';
import { checkPreflight, checkWorkspaceBoundary } from './checks/preflight.mjs';
import { checkHarnessSelf } from './checks/harness-self.mjs';
import { checkSourcePolicy } from './checks/source-policy.mjs';
import { checkGithubHistory } from './checks/github-history.mjs';
import { checkLocalHistory } from './checks/history-local.mjs';
import { checkPrPolicy } from './checks/pr-policy.mjs';
import { checkAstMetrics } from './checks/ast-metrics.mjs';
import { checkVerifierQuality } from './checks/verifier-quality.mjs';
import { checkImportGraph } from './checks/import-graph.mjs';
import { checkSecurityScan } from './checks/security-scan.mjs';
import { checkDuplicates } from './checks/duplicates.mjs';
import { checkStaticTools } from './checks/static-tools.mjs';
import { checkAndroid } from './checks/android.mjs';
import { checkDockerLocal } from './checks/docker-local.mjs';
import { startRuntime } from './checks/runtime-start.mjs';
import { checkApiDiscovery } from './checks/api-discovery.mjs';
import { checkApiContracts } from './checks/api-contracts.mjs';
import { checkProxy } from './checks/proxy.mjs';
import { checkLatency } from './checks/latency.mjs';
import { checkSecurityHeaders } from './checks/security-headers.mjs';
import { checkUiPages } from './checks/ui-pages.mjs';
import { checkUiActions } from './checks/ui-actions.mjs';
import { checkPerformance } from './checks/performance.mjs';
import { checkVideo } from './checks/video.mjs';
import { checkVisual } from './checks/visual.mjs';
import { checkDeployment } from './checks/deployment.mjs';

const config = getConfig(process.argv);
const ctx = createContext(config);
ctx.state.version = JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')).version;
process.on('SIGINT', () => { stopAll(ctx); process.exit(130); });
process.on('SIGTERM', () => { stopAll(ctx); process.exit(143); });

async function main() {
  log(ctx, 'info', 'run.start', 'KVideo strict verification started', { runId: ctx.runId, root: config.root });
  await runStage(ctx, 'preflight', 'preflight and harness integrity', async () => {
    await checkPreflight(ctx); await checkHarnessSelf(ctx); await checkSourcePolicy(ctx);
  });
  await runStage(ctx, 'history', 'GitHub history and pull-request regression policy', async () => {
    if (config.auditGithub) await checkGithubHistory(ctx);
    else await checkLocalHistory(ctx);
    await checkPrPolicy(ctx);
  });
  await runStage(ctx, 'quality', 'structural quality and security analysis', async () => {
    await checkVerifierQuality(ctx); await checkAstMetrics(ctx); await checkImportGraph(ctx);
    await checkSecurityScan(ctx); await checkDuplicates(ctx);
  });
  await runStage(ctx, 'static', 'unit, coverage, lint, type, dependency, Android, and production builds', async () => {
    await checkStaticTools(ctx); await checkAndroid(ctx);
  });
  await runStage(ctx, 'docker', 'local release container', checkDockerLocal);
  await runStage(ctx, 'runtime', 'deterministic fixtures and local application', startRuntime);
  await runStage(ctx, 'api', 'API, proxy, latency, headers, and PWA contracts', async () => {
    await checkApiDiscovery(ctx); await checkApiContracts(ctx); await checkProxy(ctx); await checkLatency(ctx); await checkSecurityHeaders(ctx);
  });
  await runStage(ctx, 'browser', 'UI, accessibility, actions, performance, video, and visual parity', async () => {
    await checkUiPages(ctx); await checkUiActions(ctx); await checkPerformance(ctx); await checkVideo(ctx); await checkVisual(ctx);
  });
  await runStage(ctx, 'deployment', 'public release consistency', checkDeployment);
  await runStage(ctx, 'postflight', 'final verification-only workspace boundary', async () => {
    await checkWorkspaceBoundary(ctx, 'postflight');
  });
}

try { await main(); }
finally {
  if (!config.keepServer) stopAll(ctx);
  const counts = writeReports(ctx);
  const latest = path.join(config.verifyDir, 'artifacts', 'latest');
  try { if (fs.lstatSync(latest).isSymbolicLink()) fs.unlinkSync(latest); } catch {}
  try { fs.symlinkSync(ctx.runId, latest, 'dir'); } catch {}
  log(ctx, 'info', 'run.end', 'KVideo strict verification finished', { counts, report: path.join(ctx.artifacts, 'report.html') });
  process.exitCode = hasFailures(ctx) ? 1 : 0;
}
