import { finding } from './finding.mjs';
import { log } from './log.mjs';

export async function runStage(ctx, id, title, task) {
  const started = Date.now();
  log(ctx, 'info', `stage.${id}.start`, `Starting ${title}`);
  try {
    await task(ctx);
    log(ctx, 'info', `stage.${id}.end`, `Finished ${title}`, { durationMs: Date.now() - started });
  } catch (error) {
    finding(ctx, {
      id: `stage.${id}.crash`,
      category: 'harness',
      title: `${title} crashed`,
      status: 'FAIL',
      severity: 'critical',
      expected: 'Stage completes and records granular findings',
      actual: error instanceof Error ? error.stack || error.message : String(error),
      reason: 'The verification harness encountered an unhandled exception.',
      impact: 'Checks in this stage may be incomplete.',
      remediation: 'Inspect the stack trace and repair the harness before trusting this run.',
      durationMs: Date.now() - started,
    });
  }
}
