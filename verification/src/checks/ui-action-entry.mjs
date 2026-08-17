function blockedExploration(reason) {
  return { eligible: false, queued: false, subsumed: false, reason, newStateFacts: [] };
}

export function skippedActionEntry(input) {
  const { route, viewport, snapshot, steps, action, urlAfter, reason, details = {} } = input;
  return {
    route, viewport: viewport.name, state: snapshot.hash, depth: steps.length,
    steps: steps.map((item) => item.key), action,
    result: { ok: true, skipped: true, reason, ...details },
    changed: false, urlAfter, exploration: blockedExploration(reason),
  };
}
