import { classifyItem, priorityOf, uncatalogedRecords } from './catalog.mjs';
import { graphTruncation } from './github.mjs';
import { normalizeHistory } from './normalize.mjs';
import { traceFiles } from './trace.mjs';

function difference(left, right) {
  const other = new Set(right);
  return left.filter((item) => !other.has(item));
}

function reviewedRisks(remote, normalized, catalog) {
  const merged = new Set(remote.pullRequests.filter((item) => item.merged_at).map((item) => item.number));
  const graph = new Map(remote.reviewGraph.map((item) => [item.number, item]));
  const threads = [...merged].flatMap((number) => (graph.get(number)?.reviewThreads.nodes || [])
    .filter((item) => !item.isResolved && !item.isOutdated)
    .map((item) => ({ id: item.id, number, path: item.path, priority: priorityOf(item.comments.nodes[0]?.body || '') })));
  const unavailable = new Set(catalog.unavailablePullRequests);
  const comments = normalized.data.reviewComments.filter((item) => unavailable.has(item.number))
    .map((item) => ({ ...item, priority: priorityOf(item.body) }));
  return { threads, comments };
}

function recordMatrices(remote, catalog, trace) {
  const merged = new Set(remote.pullRequests.filter((item) => item.merged_at).map((item) => item.number));
  const issues = remote.issues.filter((item) => catalog.issues.includes(item.number))
    .map((item) => ({ number: item.number, title: item.title, ...classifyItem(item, catalog), trace: traceFiles(trace, 'issues', item.number) }));
  const pulls = remote.pullRequests.filter((item) => catalog.pullRequests.includes(item.number))
    .map((item) => ({ number: item.number, title: item.title, merged: merged.has(item.number),
      ...classifyItem(item, catalog, merged.has(item.number)), trace: traceFiles(trace, 'pullRequests', item.number) }));
  return { issues, pulls };
}

export function createGithubAudit(remote, catalog, trace, currentPr = null) {
  const normalized = normalizeHistory(remote, catalog);
  const visible = new Set(remote.pullRequests.map((item) => item.number));
  const orphanPrs = [...new Set(remote.reviewComments.map((item) => Number(item.pull_request_url.split('/').pop()))
    .filter((number) => !visible.has(number)))].sort((a, b) => a - b);
  const auditedIssues = remote.issues.filter((item) => item.number <= catalog.issueCutoff).map((item) => item.number).sort((a, b) => a - b);
  const auditedPrs = remote.pullRequests.filter((item) => item.number <= catalog.pullRequestCutoff).map((item) => item.number).sort((a, b) => a - b);
  const inventoryDelta = {
    missingIssues: difference(catalog.issues, auditedIssues), extraIssues: difference(auditedIssues, catalog.issues),
    missingPrs: difference(catalog.pullRequests, auditedPrs), extraPrs: difference(auditedPrs, catalog.pullRequests),
    missingUnavailablePrs: difference(catalog.unavailablePullRequests, orphanPrs),
    extraUnavailablePrs: difference(orphanPrs, catalog.unavailablePullRequests),
  };
  const matrices = recordMatrices(remote, catalog, trace);
  const remoteBugs = matrices.issues.filter((item) => item.regressionRequired).map((item) => item.number).sort((a, b) => a - b);
  const remoteMerged = matrices.pulls.filter((item) => item.merged).map((item) => item.number).sort((a, b) => a - b);
  const coverageDelta = { missingBugs: difference(catalog.regressionIssues, remoteBugs), extraBugs: difference(remoteBugs, catalog.regressionIssues),
    missingMerged: difference(catalog.mergedPullRequests, remoteMerged), extraMerged: difference(remoteMerged, catalog.mergedPullRequests) };
  return { normalized, inventoryDelta, coverageDelta, uncataloged: uncatalogedRecords(remote, catalog, currentPr),
    truncation: graphTruncation(remote), issues: matrices.issues, pullRequests: matrices.pulls,
    review: reviewedRisks(remote, normalized, catalog) };
}
