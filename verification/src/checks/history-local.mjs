import path from 'node:path';
import { finding } from '../core/finding.mjs';
import { writeJson } from '../core/files.mjs';
import { loadHistoryCatalog, validateCatalog } from '../history/catalog.mjs';
import { localCoverage } from '../history/local.mjs';
import { collectTraceability } from '../history/trace.mjs';

function values(object) {
  return Object.entries(object).flatMap(([name, items]) => items.map((value) => ({ name, value })));
}

function riskFinding(ctx, options) {
  const { items, id, title, status, severity, evidence } = options;
  finding(ctx, {
    id, category: 'history', title, status: items.length ? status : 'PASS', severity,
    expected: '0 locally recorded open risks', actual: items.length ? JSON.stringify(items) : '0',
    reason: items.length ? 'The stored contract remains open and is enforced without querying GitHub.' : 'No stored risk remains open at this severity.',
    evidence, remediation: 'Fix the contract and add a focused local regression before marking the decision fixed.',
  });
}

function addStoredRisks(ctx, decisions, commentDecisions, evidence) {
  const open = [...decisions, ...commentDecisions].filter((item) => item.status === 'open')
    .map(({ id, pr, priority, contract, reason }) => ({ id, pr, priority, contract, reason }));
  const severe = open.filter((item) => ['critical', 'high'].includes(item.priority));
  const medium = open.filter((item) => !['critical', 'high'].includes(item.priority));
  riskFinding(ctx, { items: severe, id: 'history.open-severe-review-risks',
    title: 'Local critical/high review contracts are closed', status: 'FAIL', severity: 'high', evidence });
  riskFinding(ctx, { items: medium, id: 'history.open-medium-review-risks',
    title: 'Local medium review contracts are tracked', status: 'WARN', severity: 'medium', evidence });
}

export async function checkLocalHistory(ctx) {
  const loaded = loadHistoryCatalog(ctx.config.root);
  const { catalog, baseline, decisions, commentDecisions } = loaded;
  const trace = collectTraceability(ctx.config.root, catalog);
  const validation = validateCatalog(ctx.config.root, catalog, baseline, decisions, commentDecisions);
  const coverage = localCoverage(ctx.config.root, catalog, trace);
  const errors = values(validation);
  const historyDir = path.join(ctx.config.verifyDir, 'history');
  const target = path.join(ctx.dirs.metrics, 'local-history.json');
  writeJson(target, { validation, coverage, decisions, commentDecisions });
  finding(ctx, {
    id: 'history.catalog-integrity', category: 'history', title: 'Local historical contracts are internally complete',
    status: errors.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Valid local catalog and review decisions',
    actual: errors.length ? JSON.stringify(errors) : `${catalog.regressionIssues.length} issues and ${catalog.mergedPullRequests.length} merged PRs declared`,
    reason: errors.length ? 'The local source of truth is malformed.' : 'Historical requirements are stored inside verification/ and need no GitHub request.',
    evidence: [historyDir, target], remediation: 'Repair every local catalog error before trusting history coverage.',
  });
  const traceErrors = [...coverage.missing, ...coverage.nonExecutable, ...coverage.unknown];
  finding(ctx, {
    id: 'history.regression-traceability', category: 'history', title: 'Every known regression maps to executable local evidence',
    status: traceErrors.length ? 'FAIL' : 'PASS', severity: 'critical', expected: 'Direct tag in a test or invoked check',
    actual: traceErrors.length ? JSON.stringify(traceErrors) : `${coverage.issues.length} issues and ${coverage.pullRequests.length} PRs locally executable`,
    reason: traceErrors.length ? 'A tag alone is insufficient when its evidence is missing or never executed.' : 'Every required historical contract reaches code executed by this validator.',
    evidence: [target], remediation: 'Add a focused local test/check and ensure the complete runner invokes it.',
  });
  const unverifiable = catalog.unverifiableIssues || [];
  finding(ctx, {
    id: 'history.unverifiable-items', category: 'history', title: 'Unverifiable historical reports stay explicit',
    status: unverifiable.length ? 'WARN' : 'PASS', severity: 'medium', expected: '0 reports without reproducible facts',
    actual: unverifiable.length ? JSON.stringify(unverifiable) : '0',
    reason: unverifiable.length ? 'No test can be honestly derived from the stored report.' : 'Every stored report has a local contract.',
    evidence: [historyDir], remediation: 'Obtain reproduction facts before adding a claimed regression.',
  });
  addStoredRisks(ctx, decisions, commentDecisions, [target]);
}
