import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { jsonBody, request } from '../core/http.mjs';
import { waitForUrl } from '../core/service.mjs';
import { writeJson } from '../core/files.mjs';
import { createDockerContext, removeDockerContext } from './docker-context.mjs';

export async function checkDockerLocal(ctx) {
  if (ctx.config.quick) return finding(ctx, {
    id: 'docker.local-image', category: 'docker', title: 'Local Docker image build and runtime smoke', status: 'SKIP', severity: 'critical',
    expected: 'Full run', actual: '--quick', reason: 'Quick mode omits the expensive image build.', remediation: 'Run ./verification/run without --quick before release.',
  });
  const image = `kvideo-verification:${ctx.state.version}`;
  const name = `kvideo-verification-${Date.now()}`;
  const context = createDockerContext(ctx);
  let build;
  try {
    build = await runCommand(ctx, 'docker-build', 'docker', ['build', '--pull', '--tag', image, context], { timeoutMs: 1_800_000 });
  } finally {
    removeDockerContext(context);
  }
  if (build.code !== 0) return finding(ctx, {
    id: 'docker.local-image', category: 'docker', title: 'Local Docker image builds and runs', status: 'FAIL', severity: 'critical',
    expected: 'docker build exit 0', actual: `exit ${build.code}`, reason: 'The release container cannot be produced from this checkout.',
    evidence: [build.outputPath], remediation: 'Fix Dockerfile, dependency installation, or standalone build output.', durationMs: build.durationMs,
  });
  const run = await runCommand(ctx, 'docker-run', 'docker', ['run', '--detach', '--rm', '--name', name, '--publish', `127.0.0.1:${ctx.config.containerPort}:3000`, image], { timeoutMs: 60_000 });
  let ready = { ok: false, error: 'container did not start' };
  let response = null;
  let inspect = null;
  if (run.code === 0) {
    ready = await waitForUrl(ctx.config.containerUrl, 120_000);
    response = ready.ok ? await request(`${ctx.config.containerUrl}/api/app-update`) : null;
    inspect = await runCommand(ctx, 'docker-inspect-local', 'docker', ['image', 'inspect', image], { timeoutMs: 30_000 });
  }
  const logs = await runCommand(ctx, 'docker-container-logs', 'docker', ['logs', name], { timeoutMs: 30_000 });
  await runCommand(ctx, 'docker-stop', 'docker', ['stop', name], { timeoutMs: 60_000 });
  const parsed = response ? jsonBody(response) : null;
  const ok = run.code === 0 && ready.ok && response?.status === 200 && parsed?.currentVersion === ctx.state.version;
  const target = path.join(ctx.dirs.raw, 'docker-local.json');
  writeJson(target, { image, name, build, run, ready, response, parsed, inspect: inspect?.outputPath, logs: logs.outputPath });
  finding(ctx, {
    id: 'docker.local-image', category: 'docker', title: 'Local Docker image builds, starts, and reports the expected version',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: `HTTP 200 and version ${ctx.state.version}`, actual: JSON.stringify({ run: run.code, ready, status: response?.status, version: parsed?.currentVersion }),
    reason: ok ? 'The real standalone container passed a runtime smoke test.' : 'The container failed to start, respond, or expose the expected release version.',
    evidence: [build.outputPath, run.outputPath, logs.outputPath, target], remediation: 'Inspect build and container logs, then correct the Docker release path.',
    durationMs: build.durationMs + run.durationMs,
  });
}
