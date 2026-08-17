import { BROWSER_FIXTURE_ORIGIN } from './init.mjs';

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function searchStream(fixtureUrl) {
  const video = {
    vod_id: 'fixture-video-1', vod_name: '验证视频 1', vod_pic: `${fixtureUrl}/poster.svg?item=1`,
    vod_remarks: '全2集', vod_year: '2026', type_name: '测试', source: 'fixture', sourceDisplayName: 'Fixture', latency: 20,
  };
  return [
    { type: 'start', totalSources: 1 },
    { type: 'videos', videos: [video], source: 'fixture', completedSources: 1, totalSources: 1, latency: 20 },
    { type: 'progress', completedSources: 1, totalSources: 1, totalVideosFound: 1 },
    { type: 'complete', totalVideosFound: 1, totalSources: 1, maxPageCount: 1 },
  ].map((item) => `data: ${JSON.stringify(item)}\n\n`).join('');
}

function releaseBody(ctx) {
  const release = { version: ctx.state.version, publishedAt: '2026-07-31', title: 'Verification fixture', notes: ['Deterministic browser response'] };
  return {
    currentVersion: ctx.state.version, currentRelease: release, latestVersion: ctx.state.version, latestRelease: release,
    status: 'up-to-date', updateAvailable: false, checkedAt: '2026-08-01T00:00:00.000Z', checkedRemotely: true,
    usedRemoteManifest: true, source: { repository: 'KuekHaoYang/KVideo', branch: 'main',
      manifestUrl: 'https://raw.githubusercontent.com/KuekHaoYang/KVideo/main/app-release.json',
      changelogUrl: 'https://github.com/KuekHaoYang/KVideo/blob/main/CHANGELOG.md', repositoryUrl: 'https://github.com/KuekHaoYang/KVideo' },
  };
}

function detailBody() {
  return { success: true, data: {
    vod_id: 'fixture-video-1', vod_name: '验证视频 1', vod_pic: `${BROWSER_FIXTURE_ORIGIN}/poster.svg?item=1`,
    vod_content: 'Deterministic browser fixture', vod_year: '2026', type_name: '测试',
    episodes: [{ name: '第1集', url: `${BROWSER_FIXTURE_ORIGIN}/test.mp4` },
      { name: '第2集', url: `${BROWSER_FIXTURE_ORIGIN}/hls/master.m3u8` }],
  } };
}

async function handleFixture(route, url, ctx) {
  if (url.origin !== BROWSER_FIXTURE_ORIGIN) return false;
  const upstream = new URL(`${url.pathname}${url.search}`, ctx.config.fixtureUrl);
  const response = await route.fetch({ url: upstream.href });
  await route.fulfill({ response });
  return true;
}

function exactResponse(pathname, request, ctx) {
  const fixed = {
    '/api/auth/session': { authenticated: false, session: null },
    '/api/config': { subscriptionSources: '' },
    '/api/app-update': releaseBody(ctx),
    '/api/detail': detailBody(),
    '/api/ping': { latency: 20, success: true, timeout: false, method: 'HEAD' },
    '/api/probe-resolution': { width: 640, height: 360, label: '360p' },
    '/api/premium/category': { videos: [] },
    '/api/premium/types': { tags: [
      { id: 'recommend', label: '今日推荐', value: '' },
      { id: 'fixture-drama', label: '验证剧情', value: '剧情' },
    ] },
    '/api/douban/tags': { tags: ['热门', '剧情'] },
    '/api/danmaku': [],
  };
  if (pathname === '/api/auth' && request.method() === 'GET') return {
    hasAuth: false, persistSession: true, loginMode: 'none', subscriptionSources: '', iptvSources: '', mergeSources: '',
  };
  return Object.hasOwn(fixed, pathname) ? fixed[pathname] : undefined;
}

async function handleApi(route, request, pathname, ctx) {
  if (pathname === '/api/search-parallel') {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: searchStream(BROWSER_FIXTURE_ORIGIN) }); return true;
  }
  const exact = exactResponse(pathname, request, ctx);
  if (exact !== undefined) { await json(route, exact); return true; }
  if (pathname.startsWith('/api/user/')) { await json(route, { history: [], favorites: [], config: null, success: true }); return true; }
  if (pathname.startsWith('/api/douban/')) { await json(route, { tags: [], subjects: [] }); return true; }
  const mutation = pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method());
  if (mutation) { await json(route, { success: true, data: null, verification: true }); return true; }
  return false;
}

export function allowedNavigation(url, ctx) {
  const values = [ctx.config.localUrl, ctx.config.remoteUrl, ctx.config.referenceUrl, BROWSER_FIXTURE_ORIGIN].filter(Boolean);
  return values.some((value) => new URL(value).origin === url.origin);
}

export async function installMocks(target, ctx) {
  await target.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (await handleFixture(route, url, ctx)) return;
    if (await handleApi(route, request, pathname, ctx)) return;
    if (['www.gstatic.com', 'fastly.jsdelivr.net'].includes(url.hostname)) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); return;
    }
    if (request.isNavigationRequest() && !allowedNavigation(url, ctx)) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>External link verification fixture</title>' }); return;
    }
    await route.continue();
  });
}
