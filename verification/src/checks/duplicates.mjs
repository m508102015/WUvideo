import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { relative, walk, writeJson } from '../core/files.mjs';

const codeExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.kt', '.kts']);

function findReport(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).map((name) => path.join(dir, name)).find((file) => file.endsWith('.json')) || null;
}

async function cloneScan(ctx, options) {
  const output = path.join(ctx.dirs.metrics, options.name);
  const bin = path.join(ctx.config.verifyDir, 'node_modules', '.bin', 'jscpd');
  const args = ['--min-lines', String(options.minLines), '--min-tokens', String(options.minTokens),
    '--reporters', 'json', '--output', output, ...options.roots];
  const result = await runCommand(ctx, options.name, bin, args, { cwd: ctx.config.root });
  const report = findReport(output);
  let data = null;
  try { data = report ? JSON.parse(fs.readFileSync(report, 'utf8')) : null; } catch { /* invalid report */ }
  return { result, report, data };
}

function addCloneFinding(ctx, scan, options) {
  const stats = scan.data?.statistics?.total;
  const percentage = stats?.percentage ?? stats?.percentageTokens ?? null;
  const clones = scan.data?.duplicates?.length ?? null;
  const withinRatio = Number(percentage || 0) <= options.maxPercentage;
  const withinCount = options.maxClones === null || Number(clones || 0) <= options.maxClones;
  const ok = scan.result.code === 0 && scan.data && withinRatio && withinCount;
  finding(ctx, {
    id: options.id, category: options.category, title: options.title, status: ok ? 'PASS' : 'FAIL', severity: options.severity,
    expected: `duplication <=${options.maxPercentage}%${options.maxClones === null ? '' : ` and clones <=${options.maxClones}`}`,
    actual: scan.data ? `${percentage}% duplication; ${clones} clone groups` : `jscpd exit ${scan.result.code}; no report`,
    reason: ok ? 'Token-level copy detection stays within the declared strict boundary.' : 'Copied implementations create divergent fixes and repeated maintenance.',
    evidence: [scan.result.outputPath, ...(scan.report ? [scan.report] : [])],
    remediation: 'Extract one shared implementation and delete parallel copied branches.', durationMs: scan.result.durationMs,
  });
}

function duplicateGroups(root, roots) {
  const files = roots.flatMap((dir) => fs.existsSync(path.join(root, dir))
    ? walk(path.join(root, dir), (file) => codeExt.has(path.extname(file)) && !file.includes('/node_modules/') && !file.includes('/artifacts/')) : []);
  const hashes = new Map();
  for (const file of files) {
    const content = fs.readFileSync(file);
    if (content.length < 20) continue;
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    const group = hashes.get(digest) || [];
    group.push(relative(root, file));
    hashes.set(digest, group);
  }
  return [...hashes.values()].filter((group) => group.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
}

function addExactFinding(ctx, options) {
  const { id, title, groups, target, severity } = options;
  finding(ctx, {
    id, category: 'quality', title, status: groups.length ? 'FAIL' : 'PASS', severity,
    expected: '0 byte-identical authored source files', actual: groups.length ? JSON.stringify(groups) : '0',
    reason: groups.length ? 'Whole-file copies are redundant implementations and can drift independently.' : 'No authored source file is an exact copy of another.',
    evidence: [target], remediation: 'Keep one canonical module and replace copies with imports or shared data.',
  });
}

export async function checkDuplicates(ctx) {
  const projectRoots = ['app', 'components', 'lib', 'scripts', 'android-tv/app/src/main/java'];
  const verifierRoots = ['verification/src', 'verification/tests'];
  const project = await cloneScan(ctx, { name: 'jscpd-project', roots: projectRoots, minLines: 8, minTokens: 60 });
  const verifier = await cloneScan(ctx, { name: 'jscpd-verifier', roots: verifierRoots, minLines: 6, minTokens: 45 });
  addCloneFinding(ctx, project, { id: 'quality.duplication', category: 'quality', title: 'Project copy-paste duplication is minimal',
    severity: 'high', maxPercentage: 1, maxClones: null });
  addCloneFinding(ctx, verifier, { id: 'harness.duplication', category: 'harness', title: 'Verification code contains no copied implementation',
    severity: 'critical', maxPercentage: 0, maxClones: 0 });
  const exact = { project: duplicateGroups(ctx.config.root, projectRoots), verifier: duplicateGroups(ctx.config.root, verifierRoots) };
  const target = path.join(ctx.dirs.metrics, 'exact-duplicates.json');
  writeJson(target, exact);
  addExactFinding(ctx, { id: 'quality.exact-file-copies', title: 'Project has no exact source-file copies',
    groups: exact.project, target, severity: 'high' });
  addExactFinding(ctx, { id: 'harness.exact-file-copies', title: 'Verification has no exact source-file copies',
    groups: exact.verifier, target, severity: 'critical' });
}
