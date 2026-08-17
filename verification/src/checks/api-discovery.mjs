import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { relative, walk, writeJson } from '../core/files.mjs';
import { request } from '../core/http.mjs';

const methodPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;

function routePath(root, file) {
  return `/${relative(root, file).replace(/^app\//, '').replace(/\/route\.ts$/, '').replace(/\[([^\]]+)\]/g, 'verification-$1')}`;
}

export async function checkApiDiscovery(ctx) {
  if (!ctx.state.appReady) return finding(ctx, {
    id: 'api.route-coverage', category: 'api', title: 'Every API method is exercised', status: 'SKIP', severity: 'critical',
    expected: 'Local server ready', actual: 'server unavailable', reason: 'API calls cannot execute.', remediation: 'Fix local startup.',
  });
  const files = walk(path.join(ctx.config.root, 'app', 'api'), (file) => file.endsWith('/route.ts'));
  const inventory = files.map((file) => ({
    file: relative(ctx.config.root, file),
    path: routePath(ctx.config.root, file),
    methods: [...fs.readFileSync(file, 'utf8').matchAll(methodPattern)].map((match) => match[1]),
  }));
  const results = [];
  for (const route of inventory) {
    for (const method of route.methods) {
      const options = { method, timeoutMs: 12_000, headers: {} };
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        options.headers['content-type'] = 'application/json';
        options.body = '{}';
      }
      const response = await request(`${ctx.config.localUrl}${route.path}`, options);
      results.push({ ...route, methods: undefined, method, response });
    }
  }
  const target = path.join(ctx.dirs.raw, 'api-route-matrix.json');
  writeJson(target, { inventory, results });
  const unexercised = inventory.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`))
    .filter((key) => !results.some((item) => `${item.method} ${item.path}` === key));
  const crashes = results.filter((item) => !item.response.ok || item.response.status >= 500);
  finding(ctx, {
    id: 'api.route-coverage', category: 'api', title: 'Every statically exported API method receives a smoke request',
    status: unexercised.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '100% exported method invocation',
    actual: `${results.length} methods invoked; ${unexercised.length} missing`, reason: unexercised.length ? 'Some exported API methods were not reached.' : 'Every discovered method was invoked with a safe anonymous payload.',
    evidence: [target], remediation: 'Add a safe contract case for every missing method.',
  });
  finding(ctx, {
    id: 'api.anonymous-crashes', category: 'api', title: 'Anonymous malformed requests do not crash API routes',
    status: crashes.length ? 'FAIL' : 'PASS', severity: 'high', expected: 'No network error or HTTP 5xx for empty safe probes',
    actual: crashes.length ? JSON.stringify(crashes.map((item) => ({ method: item.method, path: item.path, status: item.response.status, error: item.response.error }))) : 'No crashes',
    reason: crashes.length ? 'Malformed or anonymous input reaches an internal failure instead of a controlled 4xx response.' : 'All routes rejected or handled generic probes without server failure.',
    evidence: [target], remediation: 'Validate request inputs and convert expected missing configuration/auth states to explicit 4xx responses.',
  });
  ctx.state.apiInventory = inventory;
}
