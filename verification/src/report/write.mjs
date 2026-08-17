import fs from 'node:fs';
import path from 'node:path';
import { writeJson } from '../core/files.mjs';
import { escapeXml } from '../core/xml.mjs';
import { renderHtml } from './html.mjs';

function totals(findings) {
  return findings.reduce((sum, item) => {
    sum[item.status] = (sum[item.status] || 0) + 1;
    return sum;
  }, { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0, INFO: 0 });
}

function renderJunit(ctx, counts) {
  const cases = ctx.findings.map((item) => {
    const body = item.status === 'FAIL'
      ? `<failure message="${escapeXml(item.reason)}">${escapeXml(JSON.stringify(item, null, 2))}</failure>`
      : item.status === 'SKIP' ? '<skipped/>' : '';
    return `<testcase classname="${escapeXml(item.category)}" name="${escapeXml(item.id)}" time="${item.durationMs / 1000}">${body}</testcase>`;
  }).join('\n');
  return `<?xml version="1.0"?><testsuite name="kvideo-verification" tests="${ctx.findings.length}" failures="${counts.FAIL}" skipped="${counts.SKIP}">${cases}</testsuite>`;
}

function renderMarkdown(ctx, summary) {
  const failures = ctx.findings.filter((item) => item.status === 'FAIL');
  const warnings = ctx.findings.filter((item) => item.status === 'WARN');
  const rows = [...failures, ...warnings].map((item) =>
    `| ${item.status} | ${item.severity} | \`${item.id}\` | ${item.title.replaceAll('|', '\\|')} | ${item.reason.replaceAll('|', '\\|')} |`,
  );
  return `# KVideo verification ${ctx.runId}\n\n` +
    `PASS ${summary.counts.PASS} · FAIL ${summary.counts.FAIL} · WARN ${summary.counts.WARN} · SKIP ${summary.counts.SKIP} · INFO ${summary.counts.INFO}\n\n` +
    `Duration ${summary.durationMs} ms · success ${summary.success}\n\n` +
    `A green run proves only the declared checks. Coverage gaps are explicit findings.\n\n` +
    `| Status | Severity | Check | Result | Reason |\n|---|---|---|---|---|\n${rows.join('\n') || '| PASS | info | — | No failures or warnings | — |'}\n`;
}

export function writeReports(ctx) {
  const counts = totals(ctx.findings);
  const finishedAt = new Date().toISOString();
  const durationMs = Date.parse(finishedAt) - Date.parse(ctx.startedAt);
  const summary = { runId: ctx.runId, startedAt: ctx.startedAt, finishedAt, durationMs, success: counts.FAIL === 0, counts };
  writeJson(path.join(ctx.artifacts, 'findings.json'), ctx.findings);
  writeJson(path.join(ctx.artifacts, 'summary.json'), summary);
  fs.writeFileSync(path.join(ctx.artifacts, 'junit.xml'), renderJunit(ctx, counts));
  fs.writeFileSync(path.join(ctx.artifacts, 'summary.md'), renderMarkdown(ctx, summary));
  fs.writeFileSync(path.join(ctx.artifacts, 'report.html'), renderHtml(ctx, summary));
  return counts;
}
