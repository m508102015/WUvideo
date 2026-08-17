import crypto from 'node:crypto';

function isTextual(contentType = '') {
  return /^(text\/)|json|xml|javascript|mpegurl|event-stream|svg/i.test(contentType);
}

export async function request(url, options = {}) {
  const started = performance.now();
  const { timeoutMs = 20_000, ...fetchOptions } = options;
  try {
    const response = await fetch(url, {
      redirect: fetchOptions.redirect || 'follow',
      ...fetchOptions,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const headers = Object.fromEntries(response.headers);
    const preview = buffer.subarray(0, 100_000);
    return {
      ok: true,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      headers,
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      body: isTextual(headers['content-type']) ? preview.toString('utf8') : '',
      bodyTruncated: buffer.length > preview.length,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      headers: {}, bytes: 0, sha256: null, body: '', bodyTruncated: false,
    };
  }
}

export function jsonBody(result) {
  try { return JSON.parse(result.body); } catch { return null; }
}
