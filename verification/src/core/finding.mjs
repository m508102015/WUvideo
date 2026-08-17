import { log } from './log.mjs';
import { redact } from './redact.mjs';

const validStatus = new Set(['PASS', 'FAIL', 'WARN', 'SKIP', 'INFO']);
const validSeverity = new Set(['critical', 'high', 'medium', 'low', 'info']);

export function finding(ctx, input) {
  const item = redact({
    id: input.id,
    category: input.category || 'general',
    title: input.title,
    status: validStatus.has(input.status) ? input.status : 'INFO',
    severity: validSeverity.has(input.severity) ? input.severity : 'info',
    expected: input.expected ?? null,
    actual: input.actual ?? null,
    reason: input.reason || '',
    impact: input.impact || '',
    remediation: input.remediation || '',
    evidence: input.evidence || [],
    durationMs: Math.round(input.durationMs || 0),
    at: new Date().toISOString(),
  });
  ctx.findings.push(item);
  log(ctx, item.status === 'FAIL' ? 'error' : 'info', item.id, item.title, {
    status: item.status,
    severity: item.severity,
    actual: item.actual,
    reason: item.reason,
  });
  return item;
}

export function hasFailures(ctx) {
  return ctx.findings.some((item) => item.status === 'FAIL');
}
