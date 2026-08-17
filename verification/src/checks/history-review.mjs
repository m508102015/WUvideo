function keySet(items) {
  return new Set(items.map((item) => item.id));
}

function mapDecision(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function reviewErrors(input) {
  const threadMap = mapDecision(input.decisions);
  const commentMap = mapDecision(input.commentDecisions);
  const remoteIds = keySet(input.threads);
  const remoteCommentIds = keySet(input.comments);
  const unknown = [
    ...input.threads.filter((item) => !threadMap.has(item.id)),
    ...input.comments.filter((item) => !commentMap.has(item.id)),
  ];
  const stale = [
    ...input.decisions.filter((item) => !remoteIds.has(item.id)),
    ...input.commentDecisions.filter((item) => !remoteCommentIds.has(item.id)),
  ];
  const priorityMismatch = [
    ...input.threads.map((item) => ({ item, decision: threadMap.get(item.id) })),
    ...input.comments.map((item) => ({ item, decision: commentMap.get(item.id) })),
  ].filter(({ item, decision }) => decision && item.priority !== 'unspecified' && item.priority !== decision.priority);
  const errors = { unknown, stale, priorityMismatch };
  return errors;
}
