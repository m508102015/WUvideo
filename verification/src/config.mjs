import path from 'node:path';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tv', width: 1920, height: 1080 },
];

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(argv) {
  const args = argv.slice(2);
  const root = path.resolve(valueAfter(args, '--root') || process.cwd());
  const verifyDir = path.join(root, 'verification');
  const quick = args.includes('--quick');
  const offline = args.includes('--offline');
  return {
    args,
    root,
    verifyDir,
    quick,
    offline,
    auditGithub: args.includes('--audit-github'),
    candidate: args.includes('--candidate'),
    keepServer: args.includes('--keep-server'),
    referenceUrl: valueAfter(args, '--reference-url') || 'https://kvideo.pages.dev',
    localUrl: valueAfter(args, '--base-url') || 'http://127.0.0.1:34173',
    fixtureUrl: 'http://127.0.0.1:34174',
    containerUrl: 'http://127.0.0.1:34175',
    localPort: 34173,
    fixturePort: 34174,
    containerPort: 34175,
    maxSourceLines: 150,
    maxActionStates: quick ? 30 : positive(valueAfter(args, '--max-actions'), 5000),
    maxActionDepth: quick ? 1 : positive(valueAfter(args, '--max-action-depth'), 8),
    commandTimeoutMs: quick ? 180_000 : 900_000,
    navigationTimeoutMs: 30_000,
    visualDiffRatio: 0.02,
    maxLcpMs: 2500,
    maxCls: 0.1,
    maxLongTaskMs: 500,
    coveragePercent: 100,
    minVideoAdvanceSeconds: 1.2,
    viewports: quick ? [viewports[2]] : viewports,
  };
}
