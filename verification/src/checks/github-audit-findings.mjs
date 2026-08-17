import { finding } from '../core/finding.mjs';
import { reviewErrors } from './history-review.mjs';

function flattened(object) {
  return Object.values(object).flat();
}

function inventoryFinding(ctx, audit, catalog, evidence) {
  const delta = flattened(audit.inventoryDelta);
  finding(ctx, {
    id: 'history.remote-inventory', category: 'history', title: 'Remote history matches the local record inventory',
    status: delta.length ? 'FAIL' : 'PASS', severity: 'critical', expected: `${catalog.issues.length} issues and ${catalog.pullRequests.length} PRs`,
    actual: delta.length ? JSON.stringify(audit.inventoryDelta) : 'Exact inventory match',
    reason: delta.length ? 'The explicit maintenance audit found a local/remote inventory difference.' : 'Every remote record through the cutoffs is represented locally.',
    evidence, remediation: 'Review and classify every inventory difference before updating local history data.',
  });
}

function coverageFinding(ctx, audit, evidence) {
  const delta = flattened(audit.coverageDelta);
  finding(ctx, {
    id: 'history.remote-coverage-classification', category: 'history', title: 'Remote bug and merged-PR classifications match local contracts',
    status: delta.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'No classification drift',
    actual: delta.length ? JSON.stringify(audit.coverageDelta) : 'Exact classification match',
    reason: delta.length ? 'Remote labels or merge state changed the set that requires local regression.' : 'The local contract lists match the maintenance audit.',
    evidence, remediation: 'Audit the changed records and update local tests before changing the stored lists.',
  });
}

function freshnessFindings(ctx, audit, evidence) {
  const newer = [...audit.uncataloged.issues, ...audit.uncataloged.pullRequests];
  finding(ctx, {
    id: 'history.no-uncataloged-records', category: 'history', title: 'No newer remote record is outside the local catalog',
    status: newer.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 records beyond cutoffs',
    actual: newer.length ? JSON.stringify(audit.uncataloged) : '0', reason: newer.length ? 'New records require local contracts.' : 'The cutoffs reach the newest remote records.',
    evidence, remediation: 'Understand each new record, write local evidence, then advance the catalog.',
  });
  finding(ctx, {
    id: 'history.graph-completeness', category: 'history', title: 'Remote review pagination is complete',
    status: audit.truncation.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Every totalCount equals fetched nodes',
    actual: audit.truncation.length ? JSON.stringify(audit.truncation) : 'No truncated collection',
    reason: audit.truncation.length ? 'The maintenance audit omitted remote review data.' : 'All declared remote review collections were fetched.',
    evidence, remediation: 'Add cursor pagination before accepting the remote maintenance audit.',
  });
}

function snapshotFinding(ctx, audit, baseline, evidence) {
  const mismatches = Object.keys(baseline).filter((key) => JSON.stringify(baseline[key]) !== JSON.stringify(audit.normalized.digests[key]));
  finding(ctx, {
    id: 'history.remote-snapshot', category: 'history', title: 'Remote content matches the stored maintenance snapshot',
    status: mismatches.length ? 'FAIL' : 'PASS', severity: 'high', expected: baseline,
    actual: mismatches.length ? Object.fromEntries(mismatches.map((key) => [key, audit.normalized.digests[key]])) : audit.normalized.digests,
    reason: mismatches.length ? 'Remote content changed and requires renewed local analysis.' : 'The optional remote audit matches its stored hashes.',
    evidence, remediation: 'Review the changed content before updating snapshot hashes.',
  });
}

function reviewFinding(ctx, audit, decisions, commentDecisions, evidence) {
  const errors = reviewErrors({ ...audit.review, decisions, commentDecisions });
  const failed = Object.values(errors).some((items) => items.length);
  finding(ctx, {
    id: 'history.remote-review-adjudication', category: 'history', title: 'Remote review risks match local decisions',
    status: failed ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Exact IDs and priorities',
    actual: failed ? JSON.stringify(errors) : `${audit.review.threads.length} threads and ${audit.review.comments.length} comments matched`,
    reason: failed ? 'A remote review risk is new, stale, or mis-prioritized locally.' : 'Remote review state agrees with the local decision ledger.',
    evidence, remediation: 'Classify every listed review record before accepting a snapshot update.',
  });
}

export function addGithubAuditFindings(ctx, input) {
  const { audit, catalog, baseline, decisions, commentDecisions, evidence } = input;
  inventoryFinding(ctx, audit, catalog, evidence);
  coverageFinding(ctx, audit, evidence);
  freshnessFindings(ctx, audit, evidence);
  snapshotFinding(ctx, audit, baseline, evidence);
  reviewFinding(ctx, audit, decisions, commentDecisions, evidence);
}
