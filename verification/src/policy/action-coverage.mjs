export function actionCoverageStatus(input) {
  if (input.emptyRoutes.length) return 'FAIL';
  if (input.cappedRoutes.length) return input.quick ? 'SKIP' : 'FAIL';
  return 'PASS';
}

function noveltyTokens(snapshot) {
  if (!snapshot || typeof snapshot.location !== 'string' || !Array.isArray(snapshot.signatures)) {
    throw new TypeError('A state snapshot requires a location and signature array.');
  }
  const frontierSignature = (item) => item.startsWith('sortable-order|') ? item.split('|').slice(0, 2).join('|') : item;
  const controls = [...new Set(snapshot.signatures.map(frontierSignature))].sort().map((item) => `control:${item}`);
  return [`location:${snapshot.location}`, ...controls];
}

export function registerNovelState(discovered, snapshot) {
  if (!(discovered instanceof Set)) throw new TypeError('Discovered state tokens must be a Set.');
  const tokens = noveltyTokens(snapshot);
  const added = tokens.filter((token) => !discovered.has(token));
  for (const token of added) discovered.add(token);
  return { novel: added.length > 0, added, stateFacts: tokens };
}

export function classifyStateTransition(discovered, snapshot, blockedBy = '') {
  if (blockedBy) return { eligible: false, queued: false, subsumed: false, reason: blockedBy, newStateFacts: [] };
  const novelty = registerNovelState(discovered, snapshot);
  return { eligible: true, queued: novelty.novel, subsumed: !novelty.novel,
    reason: novelty.novel ? 'new semantic state fact' : 'semantic state facts already covered', newStateFacts: novelty.added };
}

export function actionExecutionKey(snapshot, action) {
  if (typeof snapshot?.location !== 'string' || typeof action?.key !== 'string') {
    throw new TypeError('Action execution keys require a location and action key.');
  }
  return `${snapshot.location}|${action.key}`;
}

export function actionCoverageReason(input) {
  if (input.emptyRoutes.length) return 'A route/viewport exposed zero controls, so interaction coverage is not credible.';
  if (input.cappedRoutes.length) return input.quick
    ? 'Quick mode intentionally limits exploration.' : 'Reachable control states remain unexplored.';
  return 'Every route/viewport exposed controls and no additional state-changing control remained.';
}
