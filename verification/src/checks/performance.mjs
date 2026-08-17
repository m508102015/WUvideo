import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { walk, writeJson } from '../core/files.mjs';
import { inspectScrollCase, performanceProblems } from './performance-case.mjs';

function bundleMetrics(ctx) {
  const root = path.join(ctx.config.root, '.next', 'static');
  if (!fs.existsSync(root)) return { count: 0, totalBytes: 0, largest: [] };
  const bundles = walk(root, (file) => file.endsWith('.js')).map((file) => ({
    file: path.relative(ctx.config.root, file), bytes: fs.statSync(file).size,
  }));
  return { count: bundles.length, totalBytes: bundles.reduce((sum, item) => sum + item.bytes, 0),
    largest: bundles.sort((a, b) => b.bytes - a.bytes).slice(0, 20) };
}

export async function checkPerformance(ctx) {
  if (!ctx.state.browser || !ctx.state.appReady || !ctx.state.pageRoutes) return;
  const results = [];
  for (const viewport of ctx.config.viewports) {
    for (const route of ctx.state.pageRoutes) results.push(await inspectScrollCase(ctx, route, viewport));
  }
  const evaluated = results.map((result) => ({ result, ...performanceProblems(result, ctx.config) }));
  const failures = evaluated.filter((item) => item.problems.length);
  const bundle = bundleMetrics(ctx);
  const target = path.join(ctx.dirs.metrics, 'performance.json');
  writeJson(target, { cases: evaluated, bundle });
  finding(ctx, {
    id: 'performance.scroll-jank', category: 'performance', title: 'Every route and viewport scrolls smoothly under 4× CPU throttling',
    status: failures.length ? 'FAIL' : 'PASS', severity: 'high',
    expected: 'All route/viewports: >=30 frames, p95 <=34ms, >34ms <=5%, long tasks <=500ms, no runtime/network errors',
    actual: failures.length ? JSON.stringify(failures.map((item) => ({ route: item.result.route, viewport: item.result.viewport, problems: item.problems })))
      : `${results.length} route/viewport cases passed`,
    reason: failures.length ? 'At least one throttled surface exceeded its frame, task, HTTP, or runtime budget.' : 'Every enumerated surface stayed within the throttled interaction budget.',
    evidence: [target], remediation: 'Profile the exact route/viewport case, reduce render scope, virtualize lists, and remove layout thrashing.',
  });
  const largest = bundle.largest[0]?.bytes || 0;
  finding(ctx, {
    id: 'performance.bundle-size', category: 'performance', title: 'Client JavaScript bundle size is bounded',
    status: largest <= 1_000_000 ? 'PASS' : 'WARN', severity: 'medium', expected: 'Largest emitted JS asset <= 1,000,000 raw bytes',
    actual: JSON.stringify(bundle), reason: largest <= 1_000_000 ? 'No emitted asset exceeds the guardrail.' : 'A very large asset increases parse, compile, and low-end device latency.',
    evidence: [target], remediation: 'Split heavy dependencies and defer feature code outside initial routes.',
  });
}
