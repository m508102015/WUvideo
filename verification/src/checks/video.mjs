import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { playVideoCase, stallVideoCase, videoProblems } from './video-case.mjs';

// GH-ISSUE: 8,24,40,46,81,91,118,130; GH-PR: 138

function addPlaybackFinding(ctx, name, results, target) {
  const evaluated = results.map((result) => ({ result, ...videoProblems(ctx, result) }));
  const failures = evaluated.filter((item) => item.problems.length);
  finding(ctx, {
    id: `video.${name}`, category: 'video', title: `${name.toUpperCase()} plays correctly in every target viewport`,
    status: failures.length ? 'FAIL' : 'PASS', severity: 'critical',
    expected: `All viewports advance >=${ctx.config.minVideoAdvanceSeconds}s, decode 640x360, drop <=5%, and emit no runtime/network errors`,
    actual: failures.length ? JSON.stringify(failures.map((item) => ({ viewport: item.result.viewport, advance: item.advance, problems: item.problems })))
      : `${results.length} viewport cases passed`,
    reason: failures.length ? 'At least one real browser playback case stalled, decoded incorrectly, dropped frames, or emitted errors.'
      : 'Every viewport met timing, dimensions, frame-loss, and runtime contracts.',
    evidence: [target, ...results.map((item) => item.screenshot).filter(Boolean)],
    remediation: 'Inspect the exact viewport, player events, HLS configuration, codecs, proxy mode, and browser evidence.',
  });
}

function addStallFinding(ctx, results, target) {
  const failures = results.filter((item) => item.error || !item.detected || !item.recovered
    || item.observed?.consoleErrors.length || item.observed?.pageErrors.length);
  finding(ctx, {
    id: 'video.stall-detector', category: 'video', title: '200ms stall detection and recovery work in every viewport',
    status: failures.length ? 'FAIL' : 'PASS', severity: 'high', expected: 'Overlay appears during a controlled freeze and clears after recovery in all viewports',
    actual: failures.length ? JSON.stringify(failures) : `${results.length} viewport cases passed`,
    reason: failures.length ? 'At least one viewport failed controlled stall detection, recovery, or runtime safety.' : 'Every viewport responded correctly to a controlled playback freeze.',
    evidence: [target], remediation: 'Repair currentTime polling, loading-state ownership, responsive overlay rendering, or recovery clearing logic.',
  });
}

export async function checkVideo(ctx) {
  if (!ctx.state.browser || !ctx.state.mediaOk) return;
  const mp4 = [];
  const hls = [];
  const stall = [];
  for (const viewport of ctx.config.viewports) {
    mp4.push(await playVideoCase(ctx, 0, viewport));
    hls.push(await playVideoCase(ctx, 1, viewport));
    stall.push(await stallVideoCase(ctx, viewport));
  }
  const target = path.join(ctx.dirs.raw, 'video-playback.json');
  writeJson(target, { mp4, hls, stall });
  addPlaybackFinding(ctx, 'mp4', mp4, target);
  addPlaybackFinding(ctx, 'hls', hls, target);
  addStallFinding(ctx, stall, target);
}
