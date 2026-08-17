import path from 'node:path';
import { hasRuntimeProblems } from '../browser/observed.mjs';
import { newPage, stabilize } from '../browser/session.mjs';

function playerRoute(episode, title = 'verification') {
  return `/player?id=fixture-video-1&source=fixture&title=${encodeURIComponent(title)}&episode=${episode}`;
}

export async function playVideoCase(ctx, episode, viewport) {
  const session = await newPage(ctx.state.browser, ctx, viewport);
  try {
    await session.page.goto(`${ctx.config.localUrl}${playerRoute(episode)}`, {
      waitUntil: 'domcontentloaded', timeout: ctx.config.navigationTimeoutMs,
    });
    await stabilize(session.page);
    const video = session.page.locator('video');
    await video.waitFor({ state: 'attached', timeout: 20_000 });
    const before = await video.evaluate(async (element) => {
      element.muted = true; await element.play();
      return { currentTime: element.currentTime, readyState: element.readyState, networkState: element.networkState };
    });
    await session.page.waitForTimeout(2600);
    const after = await video.evaluate((element) => {
      const quality = element.getVideoPlaybackQuality?.();
      return { currentTime: element.currentTime, duration: element.duration, paused: element.paused,
        readyState: element.readyState, width: element.videoWidth, height: element.videoHeight,
        totalFrames: quality?.totalVideoFrames, droppedFrames: quality?.droppedVideoFrames,
        error: element.error?.message || null };
    });
    const screenshot = path.join(ctx.dirs.screenshots, `video-${viewport.name}-episode-${episode}.png`);
    await session.page.screenshot({ path: screenshot, fullPage: true });
    return { viewport: viewport.name, episode, before, after, observed: session.observed, screenshot };
  } catch (error) {
    return { viewport: viewport.name, episode, error: error instanceof Error ? error.stack || error.message : String(error), observed: session.observed };
  } finally { await session.context.close(); }
}

export async function stallVideoCase(ctx, viewport) {
  const session = await newPage(ctx.state.browser, ctx, viewport);
  try {
    await session.page.goto(`${ctx.config.localUrl}${playerRoute(0, 'stall')}`, { waitUntil: 'domcontentloaded' });
    await stabilize(session.page);
    const video = session.page.locator('video');
    await video.waitFor({ state: 'attached', timeout: 20_000 });
    await video.evaluate(async (element) => { element.muted = true; await element.play(); });
    await session.page.waitForTimeout(600);
    await video.evaluate((element) => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
      const frozen = descriptor.get.call(element);
      window.__kvFrozen = true;
      Object.defineProperty(element, 'currentTime', { configurable: true,
        get() { return window.__kvFrozen ? frozen : descriptor.get.call(this); },
        set(value) { descriptor.set.call(this, value); } });
    });
    await session.page.waitForTimeout(600);
    const detected = await session.page.locator('.loading-overlay-glass').isVisible().catch(() => false);
    await video.evaluate((element) => { window.__kvFrozen = false; delete element.currentTime; });
    await session.page.waitForTimeout(500);
    const recovered = !(await session.page.locator('.loading-overlay-glass').isVisible().catch(() => false));
    return { viewport: viewport.name, detected, recovered, observed: session.observed };
  } catch (error) {
    return { viewport: viewport.name, error: error instanceof Error ? error.stack || error.message : String(error), observed: session.observed };
  } finally { await session.context.close(); }
}

export function videoProblems(ctx, result) {
  const advance = result.after ? result.after.currentTime - result.before.currentTime : 0;
  const dropped = result.after?.droppedFrames || 0;
  const total = result.after?.totalFrames || 0;
  const problems = [];
  if (result.error) problems.push(result.error);
  if (advance < ctx.config.minVideoAdvanceSeconds) problems.push(`advanced ${advance}s`);
  if (result.after && (result.after.width !== 640 || result.after.height !== 360)) problems.push(`${result.after.width}x${result.after.height}`);
  if (total && dropped / total > .05) problems.push(`dropped ${dropped}/${total}`);
  if (result.after?.error) problems.push(result.after.error);
  if (hasRuntimeProblems(result.observed)) problems.push('runtime/network errors');
  return { advance, problems };
}
