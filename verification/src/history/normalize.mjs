import crypto from 'node:crypto';

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function numberFrom(url) {
  return Number(url?.split('/').pop());
}

function byNumber(a, b) {
  return (a.number || 0) - (b.number || 0) || String(a.id || '').localeCompare(String(b.id || ''));
}

export function normalizeHistory(remote, catalog) {
  const issueIds = new Set(catalog.issues);
  const prIds = new Set(catalog.pullRequests);
  const itemIds = new Set([...issueIds, ...prIds]);
  const reviewPrIds = new Set([...prIds, ...catalog.unavailablePullRequests]);
  const issues = remote.issues.filter((item) => issueIds.has(item.number)).map((item) => ({
    number: item.number, state: item.state, title: item.title, body: item.body || '',
    stateReason: item.state_reason || null, locked: Boolean(item.locked),
    labels: (item.labels || []).map((label) => label.name).sort(), createdAt: item.created_at, updatedAt: item.updated_at,
  })).sort(byNumber);
  const pullRequests = remote.pullRequests.filter((item) => prIds.has(item.number)).map((item) => ({
    number: item.number, state: item.state, mergedAt: item.merged_at || null,
    title: item.title, body: item.body || '', base: item.base?.ref || '', head: item.head?.ref || '',
    headSha: item.head?.sha || null, mergeCommitSha: item.merge_commit_sha || null,
    additions: item.additions, deletions: item.deletions, changedFiles: item.changed_files,
  })).sort(byNumber);
  const conversationComments = remote.conversationComments.map((item) => ({
    id: item.node_id || String(item.id), databaseId: item.id, number: numberFrom(item.issue_url),
    body: item.body || '', author: item.user?.login || '', createdAt: item.created_at, updatedAt: item.updated_at,
  })).filter((item) => itemIds.has(item.number)).sort(byNumber);
  const reviewComments = remote.reviewComments.map((item) => ({
    id: item.node_id || String(item.id), databaseId: item.id, number: numberFrom(item.pull_request_url),
    body: item.body || '', path: item.path || '', line: item.line || item.original_line || null,
    commitId: item.commit_id || null, originalCommitId: item.original_commit_id || null,
    replyToId: item.in_reply_to_id || null, author: item.user?.login || '', createdAt: item.created_at, updatedAt: item.updated_at,
  })).filter((item) => reviewPrIds.has(item.number)).sort(byNumber);
  const reviews = remote.reviewGraph.flatMap((pr) => pr.reviews.nodes.map((item) => ({
    id: item.id, number: pr.number, state: item.state, body: item.body || '',
    author: item.author?.login || '', submittedAt: item.submittedAt || null,
  }))).filter((item) => prIds.has(item.number)).sort(byNumber);
  const reviewThreads = remote.reviewGraph.flatMap((pr) => pr.reviewThreads.nodes.map((item) => ({
    id: item.id, number: pr.number, resolved: item.isResolved, outdated: item.isOutdated,
    path: item.path || '', line: item.line || item.originalLine || null,
    comments: item.comments.nodes.map((comment) => ({
      id: comment.id, body: comment.body || '', author: comment.author?.login || '',
      createdAt: comment.createdAt || null, updatedAt: comment.updatedAt || null,
    })).sort(byNumber),
  }))).filter((item) => prIds.has(item.number)).sort(byNumber);
  const data = { issues, pullRequests, conversationComments, reviewComments, reviews, reviewThreads };
  const digests = Object.fromEntries(Object.entries(data).map(([name, value]) => [name, { count: value.length, sha256: hash(value) }]));
  return { data, digests: { ...digests, combinedSha256: hash(data) } };
}
