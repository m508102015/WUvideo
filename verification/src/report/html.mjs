import path from 'node:path';
import { escapeXml } from '../core/xml.mjs';

function evidenceLink(ctx, entry) {
  const target = path.isAbsolute(entry) ? path.relative(ctx.artifacts, entry) : entry;
  const href = target.split(path.sep).map(encodeURIComponent).join('/');
  const label = path.isAbsolute(entry) ? path.relative(ctx.config.root, entry) : entry;
  return `<li><a href="${escapeXml(href)}">${escapeXml(label)}</a></li>`;
}

function findingCard(ctx, item) {
  const evidence = item.evidence.map((entry) => evidenceLink(ctx, entry)).join('');
  return `<article class="finding ${item.status.toLowerCase()}">
  <header><code>${escapeXml(item.id)}</code><b>${item.status}</b><span>${item.severity}</span></header>
  <h3>${escapeXml(item.title)}</h3>
  <dl><dt>Expected</dt><dd>${escapeXml(item.expected)}</dd><dt>Actual</dt><dd>${escapeXml(item.actual)}</dd>
  <dt>Reason</dt><dd>${escapeXml(item.reason)}</dd><dt>Impact</dt><dd>${escapeXml(item.impact)}</dd>
  <dt>Remediation</dt><dd>${escapeXml(item.remediation)}</dd></dl><ul>${evidence}</ul></article>`;
}

export function renderHtml(ctx, summary) {
  const cards = ctx.findings.map((item) => findingCard(ctx, item)).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>KVideo verification ${escapeXml(ctx.runId)}</title><style>
:root{font:14px/1.5 system-ui;color:#18202a;background:#f2f5f8}body{margin:0}main{max-width:1200px;margin:auto;padding:24px}
h1{margin:.2em 0}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:20px 0}
.metric,.finding{background:white;border:1px solid #dce3ea;border-radius:10px;padding:14px;box-shadow:0 2px 7px #0001}.metric b{font-size:24px;display:block}
.finding{margin:12px 0;border-left:7px solid #6b7280}.finding.pass{border-left-color:#0a8f50}.finding.fail{border-left-color:#c62828}.finding.warn{border-left-color:#d97706}
.finding header{display:flex;gap:12px;align-items:center}.finding header b{margin-left:auto}dl{display:grid;grid-template-columns:110px 1fr;gap:5px 12px}dt{font-weight:700}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
code{overflow-wrap:anywhere}a{color:#075ea8}nav{position:sticky;top:0;background:#18202a;color:white;padding:10px 24px}nav a{color:white;margin-right:15px}</style></head>
<body><nav><a href="summary.md">Summary</a><a href="findings.json">JSON</a><a href="events.ndjson">Events</a><a href="junit.xml">JUnit</a></nav>
<main><h1>KVideo strict verification</h1><p>Run ${escapeXml(ctx.runId)} · ${summary.durationMs} ms · success ${summary.success}</p>
<section class="summary">${Object.entries(summary.counts).map(([key,value]) => `<div class="metric"><b>${value}</b>${key}</div>`).join('')}</section>
<p>A pass means the declared check passed. It is not a proof that undiscovered states cannot fail.</p>${cards}</main></body></html>`;
}
