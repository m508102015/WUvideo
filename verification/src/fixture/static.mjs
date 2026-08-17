import fs from 'node:fs';
import path from 'node:path';

const types = {
  '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl', '.seg': 'video/mp2t',
};

export function sendFile(request, response, file) {
  if (!fs.existsSync(file)) { response.writeHead(404); response.end('not found'); return; }
  const size = fs.statSync(file).size;
  const range = request.headers.range;
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(file).pipe(response);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
  response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
  fs.createReadStream(file, { start, end }).pipe(response);
}
