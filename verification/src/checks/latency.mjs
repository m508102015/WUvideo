import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { jsonBody, request } from '../core/http.mjs';
import { writeJson } from '../core/files.mjs';

async function ping(ctx, url) {
  const response = await request(`${ctx.config.localUrl}/api/ping`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }), timeoutMs: 10_000,
  });
  return { response, parsed: jsonBody(response) };
}

export async function checkLatency(ctx) {
  if (!ctx.state.appReady) return;
  const fast = await ping(ctx, `${ctx.config.fixtureUrl}/fast`);
  const slow = await ping(ctx, `${ctx.config.fixtureUrl}/slow?ms=300`);
  const burst = await Promise.all(Array.from({ length: 12 }, () => ping(ctx, `${ctx.config.fixtureUrl}/slow?ms=80`)));
  const values = burst.map((item) => item.response.durationMs).sort((a, b) => a - b);
  const p95 = values[Math.ceil(values.length * 0.95) - 1];
  const target = path.join(ctx.dirs.raw, 'latency-contracts.json');
  writeJson(target, { fast, slow, burst: burst.map((item) => item.response), p95 });
  const accurate = fast.response.status === 200 && slow.response.status === 200 && fast.parsed?.success && slow.parsed?.success &&
    slow.parsed.latency >= 250 && slow.parsed.latency <= 1500 && slow.parsed.latency > fast.parsed.latency;
  finding(ctx, {
    id: 'latency.accuracy', category: 'performance', title: 'Latency probe distinguishes fast and delayed sources',
    status: accurate ? 'PASS' : 'FAIL', severity: 'high', expected: '300ms fixture reports 250-1500ms and exceeds fast fixture',
    actual: JSON.stringify({ fast: fast.parsed, slow: slow.parsed }), reason: accurate ? 'Measured latency tracks controlled upstream delay.' : 'Latency values are missing, inverted, or outside tolerance.',
    evidence: [target], remediation: 'Inspect HEAD/GET fallback timing and timeout accounting.',
  });
  finding(ctx, {
    id: 'latency.concurrent-p95', category: 'performance', title: 'Concurrent latency requests stay responsive',
    status: p95 <= 2000 ? 'PASS' : 'FAIL', severity: 'medium', expected: '12-request p95 <= 2000ms', actual: `${p95}ms`,
    reason: p95 <= 2000 ? 'The local latency endpoint handled the burst within threshold.' : 'Concurrent probes produced excessive queueing or stalls.',
    evidence: [target], remediation: 'Bound outbound concurrency and remove serial bottlenecks.',
  });
}
