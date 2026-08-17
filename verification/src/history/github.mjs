import fs from 'node:fs';
import { runCommand } from '../core/command.mjs';

const REVIEW_QUERY = `query {
  repository(owner:"KuekHaoYang", name:"KVideo") {
    pullRequests(first:100, orderBy:{field:CREATED_AT,direction:ASC}) {
      totalCount
      nodes {
        number merged
        reviews(first:100) { totalCount nodes { id state body submittedAt author { login } } }
        reviewThreads(first:100) {
          totalCount nodes {
            id isResolved isOutdated path line originalLine
            comments(first:20) { totalCount nodes { id body createdAt updatedAt author { login } } }
          }
        }
      }
    }
  }
}`;

function parse(result) {
  if (result.code !== 0) return null;
  try { return JSON.parse(fs.readFileSync(result.outputPath, 'utf8')); }
  catch { return null; }
}

function rest(ctx, name, endpoint) {
  return runCommand(ctx, name, 'gh', ['api', '--paginate', '--slurp', '-X', 'GET', endpoint], { timeoutMs: 120_000 });
}

export async function fetchGithubHistory(ctx) {
  const commands = await Promise.all([
    rest(ctx, 'github-issues', 'repos/KuekHaoYang/KVideo/issues?state=all&per_page=100'),
    rest(ctx, 'github-pulls', 'repos/KuekHaoYang/KVideo/pulls?state=all&per_page=100'),
    rest(ctx, 'github-conversation-comments', 'repos/KuekHaoYang/KVideo/issues/comments?per_page=100'),
    rest(ctx, 'github-review-comments', 'repos/KuekHaoYang/KVideo/pulls/comments?per_page=100'),
    runCommand(ctx, 'github-reviews-threads', 'gh', ['api', 'graphql', '-f', `query=${REVIEW_QUERY}`], { timeoutMs: 120_000 }),
  ]);
  const parsed = commands.map(parse);
  if (parsed.some((item) => item === null)) return { commands, error: 'One or more GitHub responses failed or were not valid JSON.' };
  const [issuePages, pullPages, conversationPages, reviewCommentPages, graph] = parsed;
  const graphErrors = graph.errors || [];
  if (graphErrors.length) return { commands, error: JSON.stringify(graphErrors) };
  return {
    commands,
    issues: issuePages.flat().filter((item) => !item.pull_request),
    pullRequests: pullPages.flat(),
    conversationComments: conversationPages.flat(),
    reviewComments: reviewCommentPages.flat(),
    reviewGraph: graph.data.repository.pullRequests.nodes,
    reviewGraphTotal: graph.data.repository.pullRequests.totalCount,
  };
}

export function graphTruncation(remote) {
  const rows = [{ scope: 'pullRequests', expected: remote.reviewGraphTotal, actual: remote.reviewGraph.length }];
  for (const pr of remote.reviewGraph) {
    rows.push({ scope: `PR ${pr.number} reviews`, expected: pr.reviews.totalCount, actual: pr.reviews.nodes.length });
    rows.push({ scope: `PR ${pr.number} threads`, expected: pr.reviewThreads.totalCount, actual: pr.reviewThreads.nodes.length });
    for (const thread of pr.reviewThreads.nodes) {
      rows.push({ scope: `thread ${thread.id} comments`, expected: thread.comments.totalCount, actual: thread.comments.nodes.length });
    }
  }
  return rows.filter((item) => item.expected !== item.actual);
}
