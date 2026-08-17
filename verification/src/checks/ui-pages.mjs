import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { launchBrowser, newPage, stabilize } from '../browser/session.mjs';
import { discoverPages } from '../browser/routes.mjs';
import { pageMetrics } from '../browser/metrics.mjs';
import { scanAxe } from '../browser/axe.mjs';

function safeName(value) {
  return value.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home';
}

async function inspectPage(browser, ctx, viewport, route) {
  const session = await newPage(browser, ctx, viewport);
  let response = null;
  let axe = { violations: [], incomplete: [] };
  try {
    response = await session.page.goto(`${ctx.config.localUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: ctx.config.navigationTimeoutMs });
    await session.page.waitForLoadState('load', { timeout: ctx.config.navigationTimeoutMs }).catch(() => {});
    await stabilize(session.page);
    axe = await scanAxe(session.page, ctx);
    const screenshot = path.join(ctx.dirs.screenshots, `${viewport.name}-${safeName(route)}.png`);
    await session.page.screenshot({ path: screenshot, fullPage: true });
    return { viewport, route, status: response?.status() || 0, metrics: await pageMetrics(session.page), axe, observed: session.observed, screenshot };
  } catch (error) {
    return { viewport, route, status: response?.status() || 0,
      error: error instanceof Error ? error.stack || error.message : String(error), axe, observed: session.observed };
  } finally {
    await session.context.close();
  }
}

export async function checkUiPages(ctx) {
  if (!ctx.state.appReady) return;
  const browser = ctx.state.browser || await launchBrowser(ctx);
  ctx.state.browser = browser;
  const routes = discoverPages(ctx);
  ctx.state.pageRoutes = routes;
  const results = [];
  for (const viewport of ctx.config.viewports) {
    for (const route of routes) {
      results.push(await inspectPage(browser, ctx, viewport, route));
    }
  }
  const target = path.join(ctx.dirs.raw, 'ui-pages.json');
  writeJson(target, results);
  const renderFailures = results.filter((item) => item.error || item.status >= 400 || item.status === 0);
  const runtimeErrors = results.filter((item) => item.metrics?.errors?.length || item.metrics?.rejections?.length
    || item.observed.pageErrors.length || item.observed.consoleErrors.length || item.observed.failedRequests.length || item.observed.httpErrors.length);
  const overflow = results.filter((item) => item.metrics && item.metrics.scrollWidth > item.metrics.clientWidth + 1);
  const severeA11y = results.flatMap((item) => item.axe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact)).map((violation) => ({ route: item.route, viewport: item.viewport.name, ...violation })));
  const advisoryA11y = results.flatMap((item) => [
    ...item.axe.violations.filter((violation) => !['critical', 'serious'].includes(violation.impact)),
    ...item.axe.incomplete,
  ].map((violation) => ({ route: item.route, viewport: item.viewport.name, ...violation })));
  const vitalFailures = results.flatMap((item) => {
    const metrics = item.metrics;
    if (!metrics) return [{ route: item.route, viewport: item.viewport.name, reason: 'metrics missing' }];
    const longTaskTotal = metrics.longTasks.reduce((sum, value) => sum + value, 0);
    const reasons = [
      ...(!Number.isFinite(metrics.lcp) || metrics.lcp <= 0 || metrics.lcp > ctx.config.maxLcpMs ? [`LCP ${metrics.lcp}ms`] : []),
      ...(!Number.isFinite(metrics.cls) || metrics.cls > ctx.config.maxCls ? [`CLS ${metrics.cls}`] : []),
      ...(longTaskTotal > ctx.config.maxLongTaskMs ? [`long tasks ${longTaskTotal}ms`] : []),
    ];
    return reasons.length ? [{ route: item.route, viewport: item.viewport.name, reasons }] : [];
  });
  aggregate(ctx, { id: 'ui.route-render', title: 'Every page renders in every target viewport', failures: renderFailures, total: results.length, severity: 'critical', evidence: target });
  aggregate(ctx, { id: 'ui.runtime-errors', title: 'Pages emit no uncaught or console errors', failures: runtimeErrors, total: results.length, severity: 'critical', evidence: target });
  aggregate(ctx, { id: 'ui.horizontal-overflow', title: 'Pages do not overflow target viewports horizontally', failures: overflow, total: results.length, severity: 'high', evidence: target });
  aggregate(ctx, { id: 'ui.accessibility', title: 'Pages have no serious or critical automated accessibility violations', failures: severeA11y, total: results.length, severity: 'high', evidence: target });
  aggregate(ctx, { id: 'ui.web-vitals', title: 'Every page meets LCP, CLS, and load long-task budgets', failures: vitalFailures, total: results.length, severity: 'high', evidence: target });
  finding(ctx, {
    id: 'ui.accessibility-advisory', category: 'ui', title: 'Moderate, minor, and incomplete accessibility checks remain visible',
    status: advisoryA11y.length ? 'WARN' : 'PASS', severity: 'medium', expected: '0 lower-impact or incomplete axe results',
    actual: advisoryA11y.length ? JSON.stringify(advisoryA11y.slice(0, 50)) : '0',
    reason: advisoryA11y.length ? 'Lower-impact or manual-review accessibility results still require inspection.' : 'Axe reported no additional advisory results.',
    evidence: [target], remediation: 'Resolve confirmed violations and manually evaluate every incomplete rule.',
  });
  ctx.state.uiPages = results;
}

function aggregate(ctx, options) {
  const { id, title, failures, total, severity, evidence } = options;
  finding(ctx, {
    id, category: 'ui', title, status: failures.length ? 'FAIL' : 'PASS', severity, expected: `0 failures across ${total} page/viewport cases`,
    actual: failures.length ? JSON.stringify(failures.slice(0, 30)) : `${total} cases passed`,
    reason: failures.length ? 'At least one enumerated page state violated the declared UI contract.' : 'Every enumerated page state met the contract.',
    evidence: [evidence], remediation: 'Open the named screenshot and evidence record, reproduce the exact route/viewport, and repair the underlying component.',
  });
}
