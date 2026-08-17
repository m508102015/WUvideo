import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { newPage, stabilize } from '../browser/session.mjs';
import { semanticDifference, semanticSnapshot } from '../browser/semantic.mjs';

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function safe(value) {
  return value.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-') || 'home';
}

function padded(image, width, height) {
  const output = new PNG({ width, height, fill: true });
  PNG.bitblt(image, output, 0, 0, image.width, image.height, 0, 0);
  return output;
}

function compare(leftFile, rightFile, diffFile) {
  const leftRaw = PNG.sync.read(fs.readFileSync(leftFile));
  const rightRaw = PNG.sync.read(fs.readFileSync(rightFile));
  const width = Math.max(leftRaw.width, rightRaw.width);
  const height = Math.max(leftRaw.height, rightRaw.height);
  const left = padded(leftRaw, width, height);
  const right = padded(rightRaw, width, height);
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(left.data, right.data, diff.data, width, height, { threshold: 0.12, includeAA: false });
  fs.writeFileSync(diffFile, PNG.sync.write(diff));
  return { pixels, total: width * height, ratio: pixels / (width * height),
    dimensions: { left: [leftRaw.width, leftRaw.height], right: [rightRaw.width, rightRaw.height] } };
}

async function waitForRenderedPage(page, timeoutMs) {
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body || (body.innerText || '').trim().length < 8) return false;
    return [...body.querySelectorAll('*')].some((element) => {
      if ((element.innerText || '').trim().length < 8) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
  }, undefined, { timeout: timeoutMs });
}

async function renderState(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    textLength: (document.body?.innerText || '').trim().length,
    textSample: (document.body?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 240),
    htmlLength: document.documentElement?.outerHTML.length || 0,
    elementCount: document.body?.querySelectorAll('*').length || 0,
  }));
}

function issue(meta, phase, error) {
  meta.issues.push({ phase, message: errorText(error) });
}

async function collect(page, meta, file) {
  try { await stabilize(page); } catch (error) { issue(meta, 'stabilize', error); }
  try { await page.locator('video,audio').evaluateAll((items) => items.forEach((item) => item.pause())); }
  catch (error) { issue(meta, 'pause-media', error); }
  try {
    await page.screenshot({ path: file, fullPage: true, mask: [page.locator('video,canvas')], maskColor: '#000000' });
    meta.screenshot = file;
  } catch (error) { issue(meta, 'screenshot', error); }
  try { meta.semantic = await semanticSnapshot(page); } catch (error) { issue(meta, 'semantic-snapshot', error); }
  try { meta.render = await renderState(page); } catch (error) { issue(meta, 'render-state', error); }
  meta.finalUrl = page.url();
}

async function capture(options) {
  const { browser, ctx, base, route, viewport, file } = options;
  const session = await newPage(browser, ctx, viewport);
  const meta = { status: 0, statusText: '', contentType: '', finalUrl: '', render: null,
    semantic: null, screenshot: null, issues: [], observed: session.observed };
  try {
    try {
      const response = await session.page.goto(`${base}${route}`, {
        waitUntil: 'domcontentloaded', timeout: ctx.config.navigationTimeoutMs,
      });
      meta.status = response?.status() || 0;
      meta.statusText = response?.statusText() || '';
      meta.contentType = await response?.headerValue('content-type') || '';
    } catch (error) { issue(meta, 'navigation', error); }
    if (!meta.issues.some((item) => item.phase === 'navigation')) {
      try { await waitForRenderedPage(session.page, ctx.config.navigationTimeoutMs); }
      catch (error) { issue(meta, 'render-wait', error); }
    }
    await collect(session.page, meta, file);
    return meta;
  } finally { await session.context.close(); }
}

export async function compareVisualCase(ctx, route, viewport) {
  const stem = `${viewport.name}-${safe(route)}`;
  const local = path.join(ctx.dirs.screenshots, `visual-local-${stem}.png`);
  const remote = path.join(ctx.dirs.screenshots, `visual-remote-${stem}.png`);
  const diff = path.join(ctx.dirs.diffs, `visual-diff-${stem}.png`);
  const common = { browser: ctx.state.browser, ctx, route, viewport };
  const localMeta = await capture({ ...common, base: ctx.config.localUrl, file: local });
  const remoteMeta = await capture({ ...common, base: ctx.config.referenceUrl, file: remote });
  let comparison = null;
  let comparisonError = null;
  if (localMeta.screenshot && remoteMeta.screenshot) {
    try {
      comparison = compare(local, remote, diff);
      comparison.semantic = semanticDifference(localMeta.semantic, remoteMeta.semantic);
    } catch (error) { comparisonError = errorText(error); }
  }
  return { route, viewport: viewport.name, localMeta, remoteMeta, comparison, comparisonError,
    local: localMeta.screenshot, remote: remoteMeta.screenshot, diff: comparison ? diff : null };
}
