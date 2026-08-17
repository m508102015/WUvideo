export async function pageMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const metrics = window.__kvMetrics || {};
    return {
      url: location.href,
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      interactive: document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[data-focusable]').length,
      navigation: navigation ? {
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd,
        response: navigation.responseEnd,
        transferSize: navigation.transferSize,
      } : null,
      lcp: metrics.lcp || 0,
      cls: metrics.cls || 0,
      longTasks: metrics.longTasks || [],
      errors: metrics.errors || [],
      rejections: metrics.rejections || [],
      resourceCount: resources.length,
      resourceBytes: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0),
    };
  });
}
