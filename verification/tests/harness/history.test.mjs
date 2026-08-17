import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyItem, uncatalogedRecords } from '../../src/history/catalog.mjs';
import { graphTruncation } from '../../src/history/github.mjs';
import { normalizeHistory } from '../../src/history/normalize.mjs';
import { localCoverage } from '../../src/history/local.mjs';

const catalog = {
  issues: [1, 2], pullRequests: [3], unavailablePullRequests: [4],
  regressionIssueOverrides: [2], unverifiableIssues: [{ number: 1, reason: 'missing data' }],
  evidence: { general: ['verification/src/checks/static-tools.mjs'] },
};

test('classification honors explicit unverifiable and regression decisions', () => {
  const unavailable = classifyItem({ number: 1, title: '[Bug]:', labels: [{ name: 'bug' }] }, catalog);
  const override = classifyItem({ number: 2, title: 'Safari failure', labels: [{ name: 'enhancement' }] }, catalog);
  assert.equal(unavailable.regressionRequired, false);
  assert.equal(unavailable.unverifiableReason, 'missing data');
  assert.equal(override.regressionRequired, true);
});

function remote(order = false) {
  const issues = [{ number: 2, state: 'closed', title: 'b', body: '', labels: [], created_at: 'a', updated_at: 'b' }, { number: 1, state: 'closed', title: 'a', body: '', labels: [], created_at: 'a', updated_at: 'b' }];
  return {
    issues: order ? issues : [...issues].reverse(),
    pullRequests: [{ number: 3, state: 'closed', title: 'p', body: '', base: { ref: 'main' }, head: { ref: 'x', sha: 'h' } }],
    conversationComments: [],
    reviewComments: [{ id: 4, node_id: 'comment', pull_request_url: 'https://api.github.test/pulls/4', body: 'risk', path: 'x', created_at: 'a', updated_at: 'b' }],
    reviewGraph: [{ number: 3, reviews: { nodes: [] }, reviewThreads: { nodes: [] } }],
  };
}

test('normalization is stable and retains unavailable-PR comments', () => {
  const first = normalizeHistory(remote(false), catalog);
  const second = normalizeHistory(remote(true), catalog);
  assert.deepEqual(first.digests, second.digests);
  assert.equal(first.data.reviewComments[0].number, 4);
});

test('review pagination mismatch is explicit', () => {
  const rows = graphTruncation({
    reviewGraphTotal: 2,
    reviewGraph: [{ number: 3, reviews: { totalCount: 1, nodes: [] }, reviewThreads: { totalCount: 0, nodes: [] } }],
  });
  assert.deepEqual(rows.map((item) => item.scope), ['pullRequests', 'PR 3 reviews']);
});

test('records beyond cutoffs fail closed while the active PR is excluded', () => {
  const newer = uncatalogedRecords({
    issues: [{ number: 2 }, { number: 5 }],
    pullRequests: [{ number: 3 }, { number: 6 }, { number: 7 }],
  }, { issueCutoff: 2, pullRequestCutoff: 3 }, 7);
  assert.deepEqual(newer, { issues: [5], pullRequests: [6] });
});

test('local coverage rejects missing and non-executed evidence', () => {
  const trace = {
    issues: new Map([[1, []], [2, ['verification/src/checks/dead.mjs']]]),
    pullRequests: new Map([[3, ['verification/tests/regression/example.test.ts']]]),
    unknown: [{ kind: 'issue', number: 99 }],
  };
  const coverage = localCoverage(process.cwd(), {
    regressionIssues: [1, 2], mergedPullRequests: [3],
  }, trace);
  assert.deepEqual(coverage.missing.map((item) => item.number), [1]);
  assert.deepEqual(coverage.nonExecutable, [{ number: 2, file: 'verification/src/checks/dead.mjs' },
    { number: 3, file: 'verification/tests/regression/example.test.ts' }]);
  assert.equal(coverage.unknown.length, 1);
});
