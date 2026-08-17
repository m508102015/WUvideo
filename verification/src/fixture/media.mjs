import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';

export async function createMedia(ctx) {
  const mp4 = path.join(ctx.dirs.media, 'test.mp4');
  const hls = path.join(ctx.dirs.media, 'hls');
  fs.mkdirSync(hls, { recursive: true });
  const generate = await runCommand(ctx, 'fixture-media', 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '60', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4,
  ], { timeoutMs: 120_000 });
  const segment = generate.code === 0 ? await runCommand(ctx, 'fixture-hls', 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', mp4,
    '-c', 'copy', '-hls_time', '2', '-hls_list_size', '0',
    '-hls_segment_filename', path.join(hls, 'segment-%03d.seg'), path.join(hls, 'master.m3u8'),
  ], { timeoutMs: 120_000 }) : { code: 1, outputPath: generate.outputPath, durationMs: 0 };
  const ok = generate.code === 0 && segment.code === 0 && fs.existsSync(mp4);
  finding(ctx, {
    id: 'fixture.media', category: 'harness', title: 'Deterministic MP4 and HLS fixtures were generated',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: 'Playable 60-second MP4 and 2-second-GOP HLS assets',
    actual: ok ? `${fs.statSync(mp4).size} bytes` : `ffmpeg exits ${generate.code}/${segment.code}`,
    reason: ok ? 'Video checks use locally generated media and do not depend on third-party streams.' : 'Video evidence cannot be produced without deterministic fixtures.',
    evidence: [generate.outputPath, segment.outputPath], remediation: 'Install a working ffmpeg with H.264/AAC support.',
    durationMs: generate.durationMs + segment.durationMs,
  });
  ctx.state.mediaOk = ok;
  return { mp4, hls };
}
