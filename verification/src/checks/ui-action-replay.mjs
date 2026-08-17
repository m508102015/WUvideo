import { stabilize } from '../browser/session.mjs';
import { performAction, scanActions, stateDifference, stateSnapshot } from '../browser/actions.mjs';
import { prepareReplayBaseline } from '../browser/action-state.mjs';

async function readState(page) {
  const actions = await scanActions(page);
  return { actions, snapshot: stateSnapshot(page.url(), actions) };
}

async function waitForTransition(page, before) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(250);
    const current = await readState(page);
    if (current.snapshot.hash !== before) return current;
  }
  return null;
}

export async function waitForExpectedState(input) {
  const { readCurrent, pause, expectedState, retries = 20 } = input;
  let current;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    current = await readCurrent();
    if (!expectedState || current.snapshot.hash === expectedState.hash) return { ok: true, ...current };
    await pause();
  }
  current = await readCurrent();
  if (current.snapshot.hash === expectedState.hash) return { ok: true, ...current };
  return { ok: false, reason: 'replayed semantic state differs from the discovered state',
    expectedHash: expectedState.hash, actualHash: current.snapshot.hash,
    ...stateDifference(expectedState, current.snapshot) };
}

async function waitForExpected(page, expectedState) {
  return waitForExpectedState({
    readCurrent: () => readState(page),
    pause: () => page.waitForTimeout(250),
    expectedState,
  });
}

async function replayOnce(input) {
  const { page, ctx, route, steps, fixtureFile, expectedState } = input;
  await page.goto(`${ctx.config.localUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: ctx.config.navigationTimeoutMs });
  await stabilize(page);
  await prepareReplayBaseline(page);
  for (const action of steps) {
    const before = await readState(page);
    const result = await performAction(page, action, fixtureFile);
    if (!result.ok) return result;
    if (!await waitForTransition(page, before.snapshot.hash)) {
      return { ok: false, reason: 'replay step did not reproduce its state transition', action: action.key };
    }
  }
  return waitForExpected(page, expectedState);
}

export async function replayState(input) {
  let result = { ok: false, reason: 'state replay did not run' };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await replayOnce(input);
    if (result.ok) return { ...result, attempt };
  }
  return result;
}
