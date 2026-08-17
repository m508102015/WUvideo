import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { jsonBody, request } from '../core/http.mjs';
import { writeJson } from '../core/files.mjs';

// GH-ISSUE: 7,10,12,16,20,21,25,143,172,186

export async function checkApiContracts(ctx) {
  if (!ctx.state.appReady) return;
  const source = { id: 'fixture', name: 'Fixture', baseUrl: ctx.config.fixtureUrl, searchPath: '/source', detailPath: '/source', enabled: true };
  const cases = [
    ['config', '/api/config', { method: 'GET' }, [200]],
    ['app-update', '/api/app-update', { method: 'GET' }, [200]],
    ['detail-missing', '/api/detail', { method: 'GET' }, [400]],
    ['detail-fixture', '/api/detail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'fixture-video-1', source }) }, [200]],
    ['search-invalid', '/api/search-parallel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, [200]],
    ['search-fixture', '/api/search-parallel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '验证视频', sources: [source] }) }, [200]],
    ['ping-invalid', '/api/ping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, [400]],
  ];
  const results = [];
  for (const [name, route, options, expected] of cases) {
    const response = await request(`${ctx.config.localUrl}${route}`, options);
    results.push({ name, route, expected, response, parsed: jsonBody(response) });
  }
  const target = path.join(ctx.dirs.raw, 'api-contracts.json');
  writeJson(target, results);
  const failed = results.filter((item) => !item.expected.includes(item.response.status));
  const search = results.find((item) => item.name === 'search-fixture');
  const streamOk = search?.response.body.includes('"type":"videos"') && search.response.body.includes('"type":"complete"');
  const detail = results.find((item) => item.name === 'detail-fixture');
  const detailOk = detail?.parsed?.success && detail.parsed?.data?.episodes?.length === 2;
  finding(ctx, {
    id: 'api.contract-status', category: 'api', title: 'Core API status contracts match expectations',
    status: failed.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Every core contract returns its declared status',
    actual: failed.length ? JSON.stringify(failed.map((item) => ({ name: item.name, status: item.response.status, expected: item.expected }))) : `${results.length} cases matched`,
    reason: failed.length ? 'A core endpoint changed or failed its response contract.' : 'Core status-code contracts are stable.', evidence: [target],
    remediation: 'Repair the endpoint or intentionally update the declared contract and consumers.',
  });
  finding(ctx, {
    id: 'api.search-stream', category: 'api', title: 'Streaming search emits video and completion events',
    status: streamOk ? 'PASS' : 'FAIL', severity: 'critical', expected: 'SSE videos event followed by complete', actual: search?.response.body || 'missing',
    reason: streamOk ? 'The deterministic source traversed the full search stream.' : 'The stream omitted results or completion.', evidence: [target],
    remediation: 'Inspect streaming serialization, source parsing, and completion handling.',
  });
  finding(ctx, {
    id: 'api.detail-fixture', category: 'api', title: 'Detail parsing returns both MP4 and HLS episodes',
    status: detailOk ? 'PASS' : 'FAIL', severity: 'critical', expected: 'success=true with 2 episodes', actual: JSON.stringify(detail?.parsed),
    reason: detailOk ? 'The real detail route parsed deterministic upstream data.' : 'The detail route or episode parser lost fixture data.', evidence: [target],
    remediation: 'Fix source lookup, upstream parsing, or episode normalization.',
  });
}
