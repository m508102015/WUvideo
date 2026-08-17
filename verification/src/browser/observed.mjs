export function hasRuntimeProblems(observed) {
  if (!observed) return false;
  const groups = ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors'];
  return groups.some((name) => (observed[name]?.length || 0) > 0);
}
