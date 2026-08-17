import { finding } from '../core/finding.mjs';
import { startProcess, waitForUrl } from '../core/service.mjs';
import { createMedia } from '../fixture/media.mjs';
import { startFixtureServer } from '../fixture/server.mjs';

export async function startRuntime(ctx) {
  await createMedia(ctx);
  await startFixtureServer(ctx);
  const fixture = await waitForUrl(`${ctx.config.fixtureUrl}/health`, 5000);
  finding(ctx, {
    id: 'runtime.fixture-server', category: 'harness', title: 'Local deterministic fixture server is reachable',
    status: fixture.ok ? 'PASS' : 'FAIL', severity: 'critical', expected: 'HTTP 200', actual: fixture.ok ? fixture.status : fixture.error,
    reason: fixture.ok ? 'API, proxy, latency, and media tests can use controlled upstream behavior.' : 'Controlled integration tests cannot run.',
    remediation: 'Free port 34174 and rerun.',
  });
  const production = ctx.state.buildOk;
  const args = production ? ['start'] : ['run', 'dev'];
  const service = await startProcess(ctx, production ? 'next-start' : 'next-dev', 'npm', args, {
    env: { PORT: String(ctx.config.localPort), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1' },
    url: ctx.config.localUrl, timeoutMs: 120_000,
  });
  const ready = service.ready?.ok;
  ctx.state.appReady = ready;
  finding(ctx, {
    id: 'runtime.local-server', category: 'runtime', title: 'KVideo local server starts and responds',
    status: ready ? 'PASS' : 'FAIL', severity: 'critical', expected: `Reachable ${production ? 'production' : 'development fallback'} server`,
    actual: ready ? `HTTP ${service.ready.status}` : service.ready?.error || 'not ready',
    reason: ready ? 'Browser and API integration checks can execute.' : 'No local application endpoint became ready.',
    impact: production ? '' : 'Production build failed, so UI evidence uses a development fallback.',
    evidence: [service.outputPath], remediation: 'Fix startup/build errors or release port 34173.',
  });
}
