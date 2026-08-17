import path from 'node:path';
import { relative, walk } from '../core/files.mjs';

function routeFromFile(root, file) {
  const part = relative(path.join(root, 'app'), file).replace(/(^|\/)page\.tsx$/, '');
  const route = `/${part}`.replace(/\/\([^/]+\)/g, '').replace(/\/+/g, '/');
  return route === '/.' ? '/' : route;
}

export function discoverPages(ctx) {
  const files = walk(path.join(ctx.config.root, 'app'), (file) => file.endsWith('/page.tsx'));
  const routes = files.map((file) => routeFromFile(ctx.config.root, file)).filter((route) => !route.includes('['));
  return [...new Set(routes)].map((route) => {
    if (route === '/player') return '/player?id=fixture-video-1&source=fixture&title=%E9%AA%8C%E8%AF%81%E8%A7%86%E9%A2%91&episode=0';
    return route;
  }).sort();
}
