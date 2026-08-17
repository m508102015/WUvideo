import { newPage, stabilize } from '../browser/session.mjs';
import { pageMetrics } from '../browser/metrics.mjs';
import { hasRuntimeProblems } from '../browser/observed.mjs';

async function scrollFrames(page) {
  return page.evaluate(async () => {
    const frames = [];
    const started = performance.now();
    let previous = started;
    await new Promise((resolve) => {
      const step = (now) => {
        frames.push(now - previous); previous = now;
        const progress = Math.min(1, (now - started) / 2500);
        scrollTo(0, Math.max(0, document.documentElement.scrollHeight - innerHeight) * progress);
        if (progress < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    frames.sort((a, b) => a - b);
    return { count: frames.length, p95: frames[Math.ceil(frames.length * .95) - 1] || 0,
      over34: frames.filter((item) => item > 34).length,
      distance: Math.max(0, document.documentElement.scrollHeight - innerHeight) };
  });
}

export async function inspectScrollCase(ctx, route, viewport) {
  const session = await newPage(ctx.state.browser, ctx, viewport);
  try {
    const cdp = await session.context.newCDPSession(session.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const response = await session.page.goto(`${ctx.config.localUrl}${route}`, {
      waitUntil: 'domcontentloaded', timeout: ctx.config.navigationTimeoutMs,
    });
    await session.page.waitForLoadState('load', { timeout: ctx.config.navigationTimeoutMs }).catch(() => {});
    await stabilize(session.page);
    await session.page.evaluate(() => { if (window.__kvMetrics) window.__kvMetrics.longTasks = []; });
    const frames = await scrollFrames(session.page);
    const metrics = await pageMetrics(session.page);
    return { route, viewport: viewport.name, status: response?.status() || 0, frames, metrics, observed: session.observed };
  } catch (error) {
    return { route, viewport: viewport.name, error: error instanceof Error ? error.stack || error.message : String(error), observed: session.observed };
  } finally { await session.context.close(); }
}

function frameProblems(result) {
  const problems = [];
  if (!result.frames) return ['frame metrics missing'];
  if (result.frames.count < 30) problems.push('insufficient animation frames');
  if (result.frames.p95 > 34) problems.push(`frame p95 ${result.frames.p95}ms`);
  if (result.frames.over34 / Math.max(result.frames.count, 1) > .05) problems.push('more than 5% frames exceed 34ms');
  return problems;
}

export function performanceProblems(result, config) {
  const problems = frameProblems(result);
  const longTaskTotal = result.metrics?.longTasks.reduce((sum, item) => sum + item, 0) || 0;
  if (result.error) problems.push(result.error);
  if (!result.status || result.status >= 400) problems.push(`HTTP ${result.status || 0}`);
  if (longTaskTotal > config.maxLongTaskMs) problems.push(`long tasks ${longTaskTotal}ms`);
  if (hasRuntimeProblems(result.observed)) problems.push('runtime or network errors');
  return { problems, longTaskTotal };
}
