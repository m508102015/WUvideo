import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { jsonBody, request } from '../core/http.mjs';
import { writeJson } from '../core/files.mjs';

// GH-ISSUE: 16,20,25,78,80,140,143,150,172,174,182,186; GH-PR: 29

function digest(output) {
  return output?.match(/^Digest:\s+(sha256:[a-f0-9]+)/m)?.[1] || null;
}

export function latestDeployment(output) {
  try {
    const rows = JSON.parse(output);
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch { return null; }
}

export async function checkDeployment(ctx) {
  if (ctx.config.candidate) return finding(ctx, {
    id: 'deploy.consistency', category: 'deployment', title: 'Local, GitHub, Cloudflare, and Docker release consistency', status: 'SKIP', severity: 'critical',
    expected: 'Published release audit', actual: '--candidate', reason: 'A candidate commit cannot match public release surfaces before it is merged and published.',
    remediation: 'After publishing, run ./verification/run without --candidate and require exact convergence.',
  });
  if (ctx.config.offline) return finding(ctx, {
    id: 'deploy.consistency', category: 'deployment', title: 'Local, GitHub, Cloudflare, and Docker release consistency', status: 'SKIP', severity: 'critical',
    expected: 'Online verification', actual: '--offline', reason: 'Remote state cannot be verified offline.', remediation: 'Rerun online before release.',
  });
  const localSha = (await runCommand(ctx, 'git-head', 'git', ['rev-parse', 'HEAD'], { timeoutMs: 30_000 })).tail.trim();
  const remoteShaResult = await runCommand(ctx, 'git-remote-main', 'git', ['ls-remote', 'origin', 'refs/heads/main'], { timeoutMs: 30_000 });
  const remoteSha = remoteShaResult.tail.trim().split(/\s+/)[0] || null;
  const githubPackage = await request('https://raw.githubusercontent.com/KuekHaoYang/KVideo/main/package.json');
  const cloudflare = await request(`${ctx.config.referenceUrl}/api/app-update`);
  const latest = await runCommand(ctx, 'dockerhub-latest', 'docker', ['buildx', 'imagetools', 'inspect', 'kuekhaoyang/kvideo:latest'], { timeoutMs: 120_000 });
  const versioned = await runCommand(ctx, 'dockerhub-version', 'docker', ['buildx', 'imagetools', 'inspect', `kuekhaoyang/kvideo:${ctx.state.version}`], { timeoutMs: 120_000 });
  const wrangler = path.join(ctx.config.verifyDir, 'node_modules', '.bin', 'wrangler');
  const pages = await runCommand(ctx, 'cloudflare-deployments', wrangler, ['pages', 'deployment', 'list', '--project-name', 'kvideo', '--environment', 'production', '--json'], { timeoutMs: 120_000 });
  const deployment = latestDeployment(fs.readFileSync(pages.outputPath, 'utf8'));
  const deployedRelease = deployment?.Deployment ? await request(`${deployment.Deployment}/api/app-update`) : null;
  const githubVersion = jsonBody(githubPackage)?.version;
  const cloudVersion = jsonBody(cloudflare)?.currentVersion;
  const deployedVersion = jsonBody(deployedRelease)?.currentVersion;
  const latestDigest = digest(latest.tail);
  const versionDigest = digest(versioned.tail);
  const deploymentSha = deployment?.Source || null;
  const deploymentUrl = deployment?.Deployment || null;
  const facts = { localSha, remoteSha, localVersion: ctx.state.version, githubVersion, cloudVersion, deployedVersion,
    deploymentSha, deploymentUrl, latestDigest, versionDigest };
  const target = path.join(ctx.dirs.raw, 'deployment-consistency.json');
  writeJson(target, { facts, githubPackage, cloudflare, deployedRelease, deployment,
    evidence: { latest: latest.outputPath, versioned: versioned.outputPath, pages: pages.outputPath } });
  const ok = localSha === remoteSha && githubVersion === ctx.state.version && cloudVersion === ctx.state.version
    && deploymentSha === localSha.slice(0, 7) && deployedVersion === ctx.state.version
    && latestDigest && latestDigest === versionDigest;
  finding(ctx, {
    id: 'deploy.consistency', category: 'deployment', title: 'Local, GitHub main, Cloudflare, and both Docker tags agree',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: 'Same Git commit/version; Docker latest and version tags share one digest', actual: JSON.stringify(facts),
    reason: ok ? 'Every public release surface resolves to the declared release.' : 'At least one release surface is stale, missing, or points at a different artifact.',
    evidence: [target, latest.outputPath, versioned.outputPath, pages.outputPath], remediation: 'Merge/push main, wait for Pages and Docker workflows, then verify version and digest convergence.',
  });
}
