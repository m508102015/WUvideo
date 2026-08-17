import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { compareVisualCase } from './visual-case.mjs';

// GH-PR: 17,198

function observedCounts(meta) {
  const value = meta?.observed || {};
  return {
    requests: value.requestCount || 0,
    responses: value.responseCount || 0,
    consoleErrors: value.consoleErrors?.length || 0,
    pageErrors: value.pageErrors?.length || 0,
    failedRequests: value.failedRequests?.length || 0,
    httpErrors: value.httpErrors?.length || 0,
  };
}

function captureSummary(meta) {
  return meta ? { status: meta.status, statusText: meta.statusText, contentType: meta.contentType,
    finalUrl: meta.finalUrl, render: meta.render, issues: meta.issues, observed: observedCounts(meta) } : null;
}

function runtimeProblems(label, meta) {
  const observed = meta?.observed;
  if (!observed) return [`${label} browser observation missing`];
  return [
    ...observed.consoleErrors.map((value) => `${label} console error: ${value}`),
    ...observed.pageErrors.map((value) => `${label} page error: ${value}`),
    ...observed.failedRequests.map((value) => `${label} request failed: ${value.url} (${value.error || 'unknown error'})`),
    ...observed.httpErrors.map((value) => `${label} HTTP ${value.status}: ${value.method} ${value.url}`),
  ];
}

function captureProblems(label, meta) {
  if (!meta) return [`${label} capture missing`];
  const problems = meta.issues.map((item) => `${label} ${item.phase}: ${item.message}`);
  if (meta.status === 0 || meta.status >= 400) problems.push(`${label} document HTTP ${meta.status}`);
  if (!meta.screenshot) problems.push(`${label} screenshot missing`);
  if (!meta.render) problems.push(`${label} render state missing`);
  else if (meta.render.textLength < 8) problems.push(`${label} visible text length ${meta.render.textLength}`);
  return [...problems, ...runtimeProblems(label, meta)];
}

export function visualProblems(item, limit) {
  const problems = [...captureProblems('local', item.localMeta), ...captureProblems('remote', item.remoteMeta)];
  if (item.comparisonError) problems.push(`pixel comparison: ${item.comparisonError}`);
  if (!item.comparison) problems.push('pixel comparison unavailable');
  else if (item.comparison.ratio > limit) problems.push(`pixel ratio ${item.comparison.ratio}`);
  if (!item.localMeta?.semantic || !item.remoteMeta?.semantic) problems.push('visible semantic snapshot unavailable');
  else if (item.localMeta.semantic.hash !== item.remoteMeta.semantic.hash) problems.push('visible semantic DOM differs');
  return problems;
}

function visualSummary(results) {
  return results.map((item) => ({ route: item.route, viewport: item.viewport, ratio: item.comparison?.ratio,
    semanticMatch: Boolean(item.localMeta?.semantic && item.remoteMeta?.semantic
      && item.localMeta.semantic.hash === item.remoteMeta.semantic.hash),
    missingSemantic: item.comparison?.semantic?.missing.length,
    unexpectedSemantic: item.comparison?.semantic?.unexpected.length,
    local: captureSummary(item.localMeta), remote: captureSummary(item.remoteMeta),
    comparisonError: item.comparisonError }));
}

export async function checkVisual(ctx) {
  if (ctx.config.offline || !ctx.state.browser || !ctx.state.pageRoutes) return finding(ctx, {
    id: 'visual.deployment-diff', category: 'visual', title: 'Local and Cloudflare UI visual comparison', status: 'SKIP', severity: 'high',
    expected: 'Online reference and browser available', actual: ctx.config.offline ? '--offline' : 'browser unavailable',
    reason: 'Pixel comparison requires both surfaces.', remediation: 'Rerun online after local startup.',
  });
  const routes = ctx.config.quick ? ['/'] : ctx.state.pageRoutes;
  const viewports = ctx.config.quick ? [ctx.config.viewports[0]] : ctx.config.viewports;
  const results = [];
  for (const viewport of viewports) {
    for (const route of routes) results.push(await compareVisualCase(ctx, route, viewport));
  }
  const target = path.join(ctx.dirs.raw, 'visual-comparison.json');
  writeJson(target, results);
  const unexpected = results.map((item) => ({ ...item, problems: visualProblems(item, ctx.config.visualDiffRatio) }))
    .filter((item) => item.problems.length);
  const images = results.flatMap((item) => [item.local, item.remote, item.diff]).filter((file) => file && fs.existsSync(file));
  finding(ctx, {
    id: 'visual.deployment-diff', category: 'visual', title: 'Local and Cloudflare UI stay within visual deviation threshold',
    status: unexpected.length ? 'FAIL' : 'PASS', severity: 'high',
    expected: `All viewports: HTTP 200, no runtime errors, exact visible semantics, pixel difference <= ${ctx.config.visualDiffRatio * 100}%`,
    actual: JSON.stringify({ summary: visualSummary(results),
      failures: unexpected.map((item) => ({ route: item.route, viewport: item.viewport, problems: item.problems })) }),
    reason: unexpected.length ? 'At least one deployment surface differs in pixels, visible semantics, HTTP state, or runtime behavior.'
      : 'Every route and viewport matches the public deployment under strict visual and semantic rules.',
    evidence: [target, ...images],
    remediation: 'Inspect each capture issue, browser error, screenshot, pixel diff, and semantic delta, then reconcile the deployed build.',
  });
}
