import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeReports } from '../../src/report/write.mjs';

test('reports include duration, success state, reasons, and clickable evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kvideo-report-'));
  const evidence = path.join(root, 'raw', 'evidence.log');
  fs.mkdirSync(path.dirname(evidence));
  fs.writeFileSync(evidence, 'proof');
  const ctx = {
    runId: 'run-1', root, artifacts: root, startedAt: new Date(Date.now() - 100).toISOString(),
    config: { root },
    findings: [{
      id: 'example', category: 'test', title: 'Example', status: 'FAIL', severity: 'high',
      expected: 'pass', actual: 'fail', reason: 'Exact reason', impact: 'impact',
      remediation: 'fix', evidence: [evidence], durationMs: 3,
    }],
  };
  try {
    writeReports(ctx);
    const summary = JSON.parse(fs.readFileSync(path.join(root, 'summary.json'), 'utf8'));
    const markdown = fs.readFileSync(path.join(root, 'summary.md'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'report.html'), 'utf8');
    assert.equal(summary.success, false);
    assert.equal(summary.durationMs >= 0, true);
    assert.match(markdown, /Exact reason/);
    assert.match(html, /href="raw\/evidence.log"/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
