import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

interface PackageData {
  scripts?: Record<string, string>;
}

function json(file: string): PackageData {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as PackageData;
}

test('verification-owned tests stay under the one verification folder', () => {
  assert.equal(fs.existsSync(path.join(root, 'verification/tests/regression')), true);
  assert.equal(fs.existsSync(path.join(root, 'verification/tests/harness')), true);
  assert.equal(fs.existsSync(path.join(root, 'tests')), true);
});

test('the complete validator is self-owned and has one entry point', () => {
  const project = json('package.json');
  const harness = json('verification/package.json');
  const runner = fs.readFileSync(path.join(root, 'verification/run'), 'utf8');
  assert.doesNotMatch(project.scripts?.test || '', /verification\/run/);
  assert.equal(harness.scripts?.verify, undefined);
  assert.equal(fs.existsSync(path.join(root, 'verification/run')), true);
  assert.match(runner, /cd "\$verify_dir"/);
  assert.doesNotMatch(runner, /npm ci --prefix/);
});

test('normal verification uses local historical contracts without GitHub access', () => {
  const main = fs.readFileSync(path.join(root, 'verification/src/main.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'verification/README.md'), 'utf8');
  assert.match(main, /config\.auditGithub/);
  assert.match(main, /else await checkLocalHistory\(ctx\)/);
  assert.match(readme, /Normal verification does not query GitHub/);
});

test('post-publication verification checks every requested release surface', () => {
  const deployment = fs.readFileSync(path.join(root, 'verification/src/checks/deployment.mjs'), 'utf8');
  assert.match(deployment, /refs\/heads\/main/);
  assert.match(deployment, /kuekhaoyang\/kvideo:latest/);
  assert.match(deployment, /kuekhaoyang\/kvideo:\$\{ctx\.state\.version\}/);
  assert.match(deployment, /cloudflare-deployments/);
  assert.match(deployment, /latestDigest === versionDigest/);
});

// GH-ISSUE: 16,20,25,78,80,140,143,150,172,174,182,186; GH-PR: 29,235
