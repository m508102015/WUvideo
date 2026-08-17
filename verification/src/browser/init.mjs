export const BROWSER_FIXTURE_ORIGIN = 'https://verification-fixture.kvideo.invalid';

export function browserInit() {
  return ({ sourceConfig }) => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* opaque document */ }
    try { Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true }); } catch {}
    const settings = {
      sources: [sourceConfig], premiumSources: [sourceConfig], subscriptions: [], sortBy: 'default', searchHistory: true,
      watchHistory: true, autoNextEpisode: true, autoSkipIntro: false, skipIntroSeconds: 0, autoSkipOutro: false,
      skipOutroSeconds: 0, seekStepSeconds: 10, showModeIndicator: true, adFilter: false, adFilterMode: 'off',
      adKeywords: [], realtimeLatency: true, searchDisplayMode: 'normal', episodeReverseOrder: false,
      fullscreenType: 'auto', proxyMode: 'none', rememberScrollPosition: false, personalizedRecommendations: false,
      videoTogetherEnabled: false, danmakuEnabled: false, danmakuApiUrl: '', danmakuOpacity: .7,
      danmakuFontSize: 20, danmakuDisplayArea: .5, locale: 'zh-CN', blockedCategories: [],
    };
    try {
      localStorage.setItem('kvideo-settings', JSON.stringify(settings));
      localStorage.setItem('theme', 'dark');
    } catch { /* opaque document */ }
    const serviceWorker = { register: async () => ({ update: async () => {} }) };
    try { Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true }); } catch { /* browser restriction */ }
    window.__kvClipboard = '';
    const clipboard = { writeText: async (value) => { window.__kvClipboard = String(value); }, readText: async () => window.__kvClipboard };
    try { Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true }); } catch { /* browser restriction */ }
    window.__kvMetrics = { errors: [], rejections: [], longTasks: [], lcp: 0, cls: 0 };
    addEventListener('error', (event) => window.__kvMetrics.errors.push(String(event.error?.stack || event.message)));
    addEventListener('unhandledrejection', (event) => window.__kvMetrics.rejections.push(String(event.reason?.stack || event.reason)));
    try { new PerformanceObserver((list) => list.getEntries().forEach((entry) => window.__kvMetrics.longTasks.push(entry.duration))).observe({ type: 'longtask', buffered: true }); } catch {}
    try { new PerformanceObserver((list) => list.getEntries().forEach((entry) => { window.__kvMetrics.lcp = entry.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { new PerformanceObserver((list) => list.getEntries().forEach((entry) => { if (!entry.hadRecentInput) window.__kvMetrics.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true }); } catch {}
  };
}

export const sourceArgument = (fixtureUrl) => ({
  sourceConfig: { id: 'fixture', name: 'Fixture', baseUrl: fixtureUrl, searchPath: '/source', detailPath: '/source', enabled: true },
});
