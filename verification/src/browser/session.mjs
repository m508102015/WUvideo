import { chromium } from 'playwright';
import { BROWSER_FIXTURE_ORIGIN, browserInit, sourceArgument } from './init.mjs';
import { installMocks } from './mocks.mjs';

export function requestFailureBucket(error) {
  return /\bERR_ABORTED\b/.test(error || '') ? 'abortedRequests' : 'failedRequests';
}

export async function launchBrowser(ctx) {
  const browser = await chromium.launch({
    executablePath: ctx.state.chromePath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'],
  });
  ctx.services.push({ name: 'playwright-browser', close: () => browser.close() });
  return browser;
}

export async function newPage(browser, ctx, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(browserInit(), sourceArgument(BROWSER_FIXTURE_ORIGIN));
  await installMocks(context, ctx);
  const page = await context.newPage();
  const observed = { consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], abortedRequests: [], httpErrors: [], dialogs: [], downloads: [], fileChoosers: [], popups: [],
    requestCount: 0, responseCount: 0 };
  page.on('console', (message) => {
    if (message.type() === 'error') observed.consoleErrors.push(message.text());
    if (message.type() === 'warning') observed.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => observed.pageErrors.push(error.stack || error.message));
  page.on('request', () => { observed.requestCount += 1; });
  page.on('requestfailed', (request) => {
    const event = { url: request.url(), error: request.failure()?.errorText };
    observed[requestFailureBucket(event.error)].push(event);
  });
  page.on('response', (response) => {
    observed.responseCount += 1;
    if (response.status() >= 400) observed.httpErrors.push({ method: response.request().method(), status: response.status(), url: response.url() });
  });
  page.on('dialog', async (dialog) => {
    observed.dialogs.push({ type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() });
    await dialog.dismiss().catch(() => {});
  });
  page.on('download', (download) => observed.downloads.push({ filename: download.suggestedFilename(), url: download.url() }));
  page.on('filechooser', (chooser) => observed.fileChoosers.push({ multiple: chooser.isMultiple() }));
  page.on('popup', (popup) => {
    const event = { url: popup.url() };
    observed.popups.push(event);
    popup.on('framenavigated', (frame) => { if (frame === popup.mainFrame()) event.url = popup.url(); });
  });
  return { context, page, observed };
}

export async function stabilize(page) {
  const css = '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}::view-transition-old(root),::view-transition-new(root){animation:none!important}';
  await page.addStyleTag({ content: css });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const images = Promise.all([...document.images].map((image) => image.complete ? null : new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));
    await Promise.race([images, new Promise((resolve) => setTimeout(resolve, 1000))]);
  });
  await page.waitForTimeout(250);
}
