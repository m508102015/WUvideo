import http from 'node:http';
import path from 'node:path';
import { posterSvg, sourceImportPayload, sourceResponse } from './source.mjs';
import { sendFile } from './static.mjs';

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  response.end(JSON.stringify(value));
}

export async function startFixtureServer(ctx) {
  const baseUrl = ctx.config.fixtureUrl;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', baseUrl);
    if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); response.end(); return; }
    if (url.pathname === '/health' || url.pathname === '/fast') { json(response, 200, { ok: true, at: Date.now() }); return; }
    if (url.pathname === '/slow') {
      const delay = Math.min(Number(url.searchParams.get('ms')) || 250, 5000);
      await new Promise((resolve) => setTimeout(resolve, delay)); json(response, 200, { ok: true, delay }); return;
    }
    if (url.pathname.startsWith('/status/')) { const status = Number(url.pathname.split('/').pop()) || 500; json(response, status, { status }); return; }
    if (url.pathname === '/redirect') { response.writeHead(302, { Location: `${baseUrl}/fast` }); response.end(); return; }
    if (url.pathname === '/headers') { json(response, 200, { method: request.method, headers: request.headers }); return; }
    const sourceRoutes = { '/source': () => sourceResponse(baseUrl, url.searchParams),
      '/source-import.json': () => sourceImportPayload(baseUrl) };
    if (sourceRoutes[url.pathname]) { json(response, 200, sourceRoutes[url.pathname]()); return; }
    if (url.pathname === '/poster.svg') { response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' }); response.end(posterSvg(url.searchParams.get('item'))); return; }
    if (url.pathname === '/test.mp4') { sendFile(request, response, path.join(ctx.dirs.media, 'test.mp4')); return; }
    if (url.pathname.startsWith('/hls/')) { sendFile(request, response, path.join(ctx.dirs.media, url.pathname.slice(1))); return; }
    json(response, 404, { error: 'fixture route not found', path: url.pathname });
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(ctx.config.fixturePort, '127.0.0.1', resolve));
  const service = { name: 'fixture-server', close: () => server.close() };
  ctx.services.push(service);
  return service;
}
