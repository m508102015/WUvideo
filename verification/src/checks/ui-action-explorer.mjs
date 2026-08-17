import path from 'node:path';
import { log } from '../core/log.mjs';
import { performAction, scanActions, stateSnapshot } from '../browser/actions.mjs';
import { assessAction, captureActionEvidence } from '../browser/action-effects.mjs';
import { prepareActionState } from '../browser/action-state.mjs';
import { actionExecutionKey, classifyStateTransition, registerNovelState } from '../policy/action-coverage.mjs';
import { skippedActionEntry } from './ui-action-entry.mjs';
import { replayState } from './ui-action-replay.mjs';

function safe(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
}

function staysWithinRoute(ctx, route, action, urlAfter) {
  const start = new URL(route, ctx.config.localUrl);
  const target = action.href ? new URL(action.href, start) : new URL(urlAfter);
  return target.origin === start.origin && target.pathname === start.pathname;
}

async function failureShot(page, ctx, viewport, route, sequence) {
  const name = `action-failure-${viewport.name}-${safe(route)}-${sequence}.png`;
  await page.screenshot({ path: path.join(ctx.dirs.screenshots, name), fullPage: true }).catch(() => {});
}

async function exerciseAction(input) {
  const { ctx, session, route, viewport, steps, action, snapshot, fixtureFile, sequence, discovered } = input;
  const stepKeys = steps.map((item) => item.key);
  if (action.disabled) {
    const entry = skippedActionEntry({ route, viewport, snapshot, steps, action, urlAfter: session.page.url(), reason: 'control disabled' });
    return { entry, next: null, subsumed: 0 };
  }
  const reset = await replayState({ page: session.page, ctx, route, steps, fixtureFile, expectedState: snapshot });
  if (!reset.ok) {
    const entry = { route, viewport: viewport.name, state: snapshot.hash, depth: steps.length,
      steps: stepKeys, phase: 'action-reset', action, result: reset,
      exploration: classifyStateTransition(discovered, null, 'action state reset failed') };
    return { entry, next: null, subsumed: 0 };
  }
  await prepareActionState(session.page, action);
  await session.page.waitForTimeout(100);
  const preparedActions = await scanActions(session.page);
  const preparedState = stateSnapshot(session.page.url(), preparedActions);
  const before = await captureActionEvidence(session.page, session.observed, preparedState);
  let interaction;
  try {
    interaction = await performAction(session.page, action, fixtureFile);
  } catch (error) {
    interaction = { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  const observed = await observeOutcome(session, action, interaction, before);
  const result = observed.assessment.ok ? interaction : { ...interaction, ok: false,
    reason: observed.assessment.reason, failureKind: observed.assessment.failureKind };
  const entry = { route, viewport: viewport.name, state: snapshot.hash, depth: steps.length, steps: stepKeys,
    action, interaction, assessment: observed.assessment, result, changed: observed.assessment.stateChanged,
    effects: observed.assessment.effects, urlAfter: session.page.url() };
  if (!result.ok) {
    log(ctx, 'error', 'ui.action-failure', 'Runtime control interaction failed', entry);
    await failureShot(session.page, ctx, viewport, route, sequence);
  }
  const blockedBy = !result.ok ? 'action failed' : !observed.assessment.stateChanged ? 'control state did not change'
    : steps.length >= ctx.config.maxActionDepth ? 'maximum action depth reached'
      : !staysWithinRoute(ctx, route, action, session.page.url()) ? 'transition left the current route' : '';
  const exploration = classifyStateTransition(discovered, observed.afterState, blockedBy);
  entry.exploration = exploration;
  const next = exploration.queued ? { steps: [...steps, action], expectedState: observed.afterState } : null;
  return { entry, next, subsumed: exploration.subsumed ? 1 : 0 };
}

async function observeOutcome(session, action, interaction, before) {
  let outcome;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await session.page.waitForTimeout(150);
    const actions = await scanActions(session.page);
    const afterState = stateSnapshot(session.page.url(), actions);
    const after = await captureActionEvidence(session.page, session.observed, afterState);
    const assessment = assessAction(action, interaction, before, after);
    outcome = { after, afterState, assessment };
    if (assessment.ok || ['automation', 'runtime'].includes(assessment.failureKind)) break;
  }
  return outcome;
}

async function inspectState(input) {
  const { ctx, session, route, viewport, steps, fixtureFile, expectedState, seen, tested, discovered, remaining, sequence } = input;
  const replay = await replayState({ page: session.page, ctx, route, steps, fixtureFile, expectedState });
  if (!replay.ok) {
    const entry = { route, viewport: viewport.name, depth: steps.length, steps: steps.map((item) => item.key), phase: 'state-replay', result: replay };
    log(ctx, 'error', 'ui.action-failure', 'State path replay failed', entry);
    await failureShot(session.page, ctx, viewport, route, sequence);
    return { entries: [entry], next: [], used: 0, hitCap: false, subsumed: 0, deduplicated: 0 };
  }
  const { actions, snapshot } = replay;
  if (seen.has(snapshot.hash)) return { entries: [], next: [], used: 0, hitCap: false, subsumed: 0, deduplicated: 0 };
  seen.add(snapshot.hash);
  registerNovelState(discovered, snapshot);
  const entries = [];
  const next = [];
  let used = 0;
  let subsumed = 0;
  let deduplicated = 0;
  let hitCap = false;
  for (const action of actions) {
    const stateAction = actionExecutionKey(snapshot, action);
    if (tested.has(stateAction)) {
      entries.push(skippedActionEntry({ route, viewport, snapshot, steps, action, urlAfter: session.page.url(),
        reason: 'same location and control semantic state already executed', details: { deduplicated: true } }));
      deduplicated += 1; continue;
    }
    if (used >= remaining) { hitCap = true; break; }
    tested.add(stateAction);
    const outcome = await exerciseAction({ ...input, action, snapshot, sequence: sequence + entries.length });
    entries.push(outcome.entry);
    if (outcome.next) next.push(outcome.next);
    subsumed += outcome.subsumed;
    used += 1;
  }
  return { entries, next, used, hitCap, subsumed, deduplicated };
}

export async function exploreRoute(input) {
  const { ctx, route, viewport } = input;
  const queue = [{ steps: [], expectedState: null }];
  const seen = new Set();
  const tested = new Set();
  const discovered = new Set();
  const entries = [];
  let actions = 0;
  let subsumedStates = 0;
  let deduplicatedActions = 0;
  let hitCap = false;
  log(ctx, 'info', 'ui.action-route.start', 'Starting recursive runtime control exploration', { route, viewport: viewport.name });
  while (queue.length && actions < ctx.config.maxActionStates) {
    const statePath = queue.shift();
    const state = await inspectState({ ...input, ...statePath, seen, tested, discovered,
      remaining: ctx.config.maxActionStates - actions, sequence: entries.length });
    entries.push(...state.entries);
    queue.push(...state.next);
    actions += state.used;
    subsumedStates += state.subsumed;
    deduplicatedActions += state.deduplicated;
    if (state.hitCap) { hitCap = true; break; }
  }
  const capped = hitCap || queue.length > 0;
  log(ctx, 'info', 'ui.action-route.end', 'Finished recursive runtime control exploration', {
    route, viewport: viewport.name, actions, uniqueActions: tested.size, uniqueStates: seen.size,
    frontierFacts: discovered.size, subsumedStates, deduplicatedActions, pendingStates: queue.length, capped,
  });
  return { entries, capped, actions, states: seen.size, frontierFacts: discovered.size, subsumedStates, deduplicatedActions };
}
