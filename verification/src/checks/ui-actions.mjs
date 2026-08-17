import fs from 'node:fs';
import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { walk, relative, writeJson } from '../core/files.mjs';
import { newPage } from '../browser/session.mjs';
import { actionCoverageReason, actionCoverageStatus } from '../policy/action-coverage.mjs';
import { exploreRoute } from './ui-action-explorer.mjs';

// GH-ISSUE: 12,21,32,41,146,182; GH-PR: 136,137

function sourceActionInventory(ctx) {
  const files = walk(ctx.config.root, (file) => /\.(tsx|jsx)$/.test(file) && !file.includes('/verification/'));
  return files.flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) =>
    /<(button|input|select|textarea)|onClick=|role=["']button/.test(line)
      ? [{ file: relative(ctx.config.root, file), line: index + 1 }] : []));
}

async function exploreViewport(ctx, viewport, fixtureFile) {
  const session = await newPage(ctx.state.browser, ctx, viewport);
  await session.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const results = [];
  const cappedRoutes = [];
  const emptyRoutes = [];
  let subsumedStates = 0;
  let deduplicatedActions = 0;
  for (const route of ctx.state.pageRoutes) {
    const explored = await exploreRoute({ ctx, session, route, viewport, fixtureFile });
    results.push(...explored.entries);
    subsumedStates += explored.subsumedStates;
    deduplicatedActions += explored.deduplicatedActions;
    if (explored.capped) cappedRoutes.push(`${viewport.name}:${route}`);
    if (explored.actions === 0) emptyRoutes.push(`${viewport.name}:${route}`);
  }
  const trace = path.join(ctx.dirs.traces, `ui-actions-${viewport.name}.zip`);
  await session.context.tracing.stop({ path: trace });
  await session.context.close();
  return { results, cappedRoutes, emptyRoutes, subsumedStates, deduplicatedActions, observed: session.observed, trace };
}

function addExecutionFinding(ctx, results, skipped, target, traces) {
  const effectKinds = new Set(['no-effect', 'media-proof']);
  const failures = results.filter((item) => item.result && !item.result.ok && !effectKinds.has(item.result.failureKind));
  finding(ctx, {
    id: 'ui.action-execution', category: 'ui', title: 'Every discovered runtime control accepts its intended interaction',
    status: failures.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 click/fill/select/upload failures',
    actual: failures.length ? JSON.stringify(failures.slice(0, 30)) : `${results.length - skipped.length} operated; ${skipped.length} disabled/skipped`,
    reason: failures.length ? 'A visible runtime control could not be replayed or operated.' : 'All discovered controls were exercised without automation failure.',
    evidence: [target, ...traces], remediation: 'Repair unstable selectors, disabled-state logic, click handlers, or the underlying UI exception.',
  });
}

function addEffectFinding(ctx, results, target, traces) {
  const inspected = results.filter((item) => item.assessment && !item.assessment.idempotent);
  const failures = inspected.filter((item) => !item.assessment.ok
    && ['no-effect', 'media-proof'].includes(item.assessment.failureKind));
  finding(ctx, {
    id: 'ui.action-observable-effects', category: 'ui', title: 'Every operated control produces its intended observable effect',
    status: failures.length ? 'FAIL' : 'PASS', severity: 'critical', expected: '0 silent no-op controls and valid media semantics',
    actual: failures.length ? JSON.stringify(failures.slice(0, 50)) : `${inspected.length} interactions produced observable effects`,
    reason: failures.length ? 'A control accepted automation but did not change UI/state/storage/media/network/navigation or failed dedicated media proof.'
      : 'Each non-idempotent interaction produced independently observable evidence.',
    evidence: [target, ...traces], remediation: 'Repair the handler or add a deterministic success fixture that exposes the intended effect.',
  });
}

function addCoverageFinding(ctx, results, cappedRoutes, emptyRoutes, target) {
  const input = { quick: ctx.config.quick, cappedRoutes, emptyRoutes };
  const status = actionCoverageStatus(input);
  const details = [];
  if (emptyRoutes.length) details.push(`zero-control surfaces: ${emptyRoutes.join(', ')}`);
  if (cappedRoutes.length) details.push(`coverage cap reached: ${cappedRoutes.join(', ')}`);
  finding(ctx, {
    id: 'ui.action-state-coverage', category: 'ui', title: 'Every viewport action graph discovers controls and exhausts its queue',
    status, severity: 'high', expected: `At least one control per route/viewport; below ${ctx.config.maxActionStates} actions and depth ${ctx.config.maxActionDepth}`,
    actual: details.length ? `${details.join('; ')}; ${results.length} results` : `${results.length} results; all queues exhausted`,
    reason: actionCoverageReason(input),
    evidence: [target], remediation: 'Raise limits or split workflows until every reachable route/viewport state is exhausted.',
  });
}

function addInventoryFinding(ctx, data, target) {
  const unique = new Set(data.results.filter((item) => item.action)
    .map((item) => `${item.viewport}|${item.route}|${item.action.key}`)).size;
  finding(ctx, {
    id: 'ui.action-inventory', category: 'ui', title: 'Static declarations and runtime controls are fully recorded',
    status: 'INFO', severity: 'info', expected: 'Auditable static and runtime populations',
    actual: JSON.stringify({ staticDeclarationSites: data.declared.length, runtimeActionInstances: data.results.length,
      uniqueRuntimeControls: unique, disabledOrSkipped: data.skipped.length, cappedRoutes: data.cappedRoutes,
      zeroControlSurfaces: data.emptyRoutes, subsumedSemanticStates: data.subsumedStates,
      deduplicatedSemanticActions: data.deduplicatedActions }),
    reason: 'Every target viewport is explored; static declarations remain separate because source sites do not map one-to-one to rendered instances.',
    evidence: [target], remediation: 'Inspect declaration sites absent from all reachable runtime states.',
  });
}

export async function checkUiActions(ctx) {
  if (!ctx.state.browser || !ctx.state.pageRoutes) return;
  const fixtureFile = path.join(ctx.dirs.raw, 'import-fixture.json');
  fs.writeFileSync(fixtureFile, JSON.stringify({ sources: [{ id: 'file-fixture', name: 'File Fixture',
    baseUrl: 'https://verification-fixture.kvideo.invalid', enabled: true, group: 'normal' }] }));
  const runs = [];
  for (const viewport of ctx.config.viewports) runs.push(await exploreViewport(ctx, viewport, fixtureFile));
  const results = runs.flatMap((item) => item.results);
  const cappedRoutes = runs.flatMap((item) => item.cappedRoutes);
  const emptyRoutes = runs.flatMap((item) => item.emptyRoutes);
  const subsumedStates = runs.reduce((total, item) => total + item.subsumedStates, 0);
  const deduplicatedActions = runs.reduce((total, item) => total + item.deduplicatedActions, 0);
  const skipped = results.filter((item) => item.result?.skipped);
  const declared = sourceActionInventory(ctx);
  const target = path.join(ctx.dirs.raw, 'ui-actions.json');
  const summary = { operated: results.filter((item) => item.interaction?.ok && !item.interaction.skipped).length,
    stateChanges: results.filter((item) => item.assessment?.stateChanged).length,
    effectFailures: results.filter((item) => item.assessment && !item.assessment.ok).length,
    subsumedStates, deduplicatedActions };
  writeJson(target, { results, declared, cappedRoutes, emptyRoutes, summary, observed: runs.map((item) => item.observed) });
  const traces = runs.map((item) => item.trace);
  addExecutionFinding(ctx, results, skipped, target, traces);
  addEffectFinding(ctx, results, target, traces);
  addCoverageFinding(ctx, results, cappedRoutes, emptyRoutes, target);
  addInventoryFinding(ctx, { results, declared, skipped, cappedRoutes, emptyRoutes, subsumedStates, deduplicatedActions }, target);
}
