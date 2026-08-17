import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { request } from '../core/http.mjs';
import { writeJson } from '../core/files.mjs';

export const PROXY_FIXTURES = Object.freeze({
  binary: 'https://httpbingo.org/image/png',
  range: 'https://httpbingo.org/range/1024',
  hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  notFound: 'https://httpbingo.org/status/404',
  redirect: 'https://httpbingo.org/redirect-to?url=https%3A%2F%2Fhttpbingo.org%2Fimage%2Fpng',
});

async function collectCases(ctx, proxy) {
  const cases = {
    missing: await request(`${ctx.config.localUrl}/api/proxy`),
    fileProtocol: await request(proxy('file:///etc/hosts')),
    loopback: await request(proxy(`${ctx.config.fixtureUrl}/test.mp4`)),
  };
  if (ctx.config.offline) return cases;
  return Object.assign(cases, {
    binary: await request(proxy(PROXY_FIXTURES.binary)),
    range: await request(proxy(PROXY_FIXTURES.range), { headers: { range: 'bytes=0-99' } }),
    hls: await request(proxy(PROXY_FIXTURES.hls)),
    notFound: await request(proxy(PROXY_FIXTURES.notFound)),
    redirect: await request(proxy(PROXY_FIXTURES.redirect)),
  });
}

function proxyFunctional(cases) {
  const statuses = cases.missing.status === 400 && cases.binary?.status === 200 && cases.range?.status === 206;
  const payloads = cases.range?.bytes === 100 && cases.hls?.status === 200 && cases.hls?.body.includes('/api/proxy?url=');
  return Boolean(statuses && payloads && cases.notFound?.status === 404 && cases.redirect?.status === 200);
}

function caseSummary(cases) {
  return Object.fromEntries(Object.entries(cases).map(([key, value]) => [key,
    { status: value.status, bytes: value.bytes, headers: value.headers }]));
}

function addFunctionalFinding(ctx, cases, target) {
  const functional = proxyFunctional(cases);
  const offline = ctx.config.offline;
  finding(ctx, {
    id: 'proxy.functional', category: 'proxy', title: 'Media proxy preserves errors, ranges, redirects, CORS, and rewrites HLS',
    status: offline ? 'SKIP' : functional ? 'PASS' : 'FAIL', severity: 'critical', expected: 'All six public proxy contracts pass',
    actual: JSON.stringify(caseSummary(cases)),
    reason: offline ? 'Public proxy fixtures are unavailable in offline mode.' : functional ? 'Public upstream behavior survived the proxy contract.' : 'One or more core proxy behaviors are broken.',
    evidence: [target], remediation: offline ? 'Rerun online.' : 'Fix forwarding, range/header preservation, redirect handling, or playlist rewriting.',
  });
}

function addSecurityFindings(ctx, cases, target) {
  const blocksUnsupported = cases.fileProtocol.status >= 400 && cases.fileProtocol.status < 500;
  finding(ctx, {
    id: 'proxy.protocol-validation', category: 'security', title: 'Proxy rejects unsupported protocols before fetching',
    status: blocksUnsupported ? 'PASS' : 'FAIL', severity: 'high', expected: 'Controlled HTTP 4xx for file://', actual: cases.fileProtocol.status,
    reason: blocksUnsupported ? 'Unsupported protocols are rejected as client input.' : 'Unsupported protocols fall into a server error instead of explicit validation.',
    evidence: [target], remediation: 'Allow only http: and https: before invoking fetch.',
  });
  const loopbackFetched = cases.loopback.status < 400 || cases.loopback.status >= 500;
  finding(ctx, {
    id: 'proxy.private-network-ssrf', category: 'security', title: 'Proxy blocks loopback and private-network targets',
    status: loopbackFetched ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Controlled HTTP 4xx for loopback', actual: `loopback HTTP ${cases.loopback.status}`,
    reason: loopbackFetched ? 'The public proxy route can reach 127.0.0.1, demonstrating an SSRF primitive on self-hosted deployments.' : 'Private address access was blocked.',
    impact: 'An exposed self-hosted instance may reach internal services available to the application host.', evidence: [target],
    remediation: 'Resolve DNS safely and reject loopback, link-local, private, multicast, and metadata-service address ranges across redirects.',
  });
}

export async function checkProxy(ctx) {
  if (!ctx.state.appReady) return;
  const proxy = (url) => `${ctx.config.localUrl}/api/proxy?url=${encodeURIComponent(url)}`;
  const cases = await collectCases(ctx, proxy);
  const target = path.join(ctx.dirs.raw, 'proxy-contracts.json');
  writeJson(target, cases);
  addFunctionalFinding(ctx, cases, target);
  addSecurityFindings(ctx, cases, target);
}
