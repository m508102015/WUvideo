#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { walk } from './core/files.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const verifyDir = path.join(root, 'verification');
const testsDir = path.join(verifyDir, 'tests', 'regression');

function requestedOutput(args) {
  const index = args.indexOf('--output-dir');
  if (index < 0) return null;
  if (!args[index + 1]) throw new Error('--output-dir requires a path');
  const target = path.resolve(root, args[index + 1]);
  const relative = path.relative(verifyDir, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Regression output must stay below verification/');
  }
  return target;
}

function outputFiles(entries, outputDir) {
  return entries.map((file) => path.join(outputDir,
    path.relative(testsDir, file).replace(/\.ts$/, '.cjs')));
}

async function execute(files) {
  const child = spawn(process.execPath, ['--test', ...files], {
    cwd: root, env: process.env, stdio: 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value, signal) => resolve(signal ? 1 : (value ?? 1)));
  });
}

async function run() {
  const entries = walk(testsDir, (file) => file.endsWith('.test.ts')).sort();
  if (!entries.length) throw new Error('No regression tests found');
  const requested = requestedOutput(process.argv.slice(2));
  const scratch = path.join(verifyDir, 'tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const outputDir = requested || fs.mkdtempSync(path.join(scratch, 'regression-'));
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    await build({
      absWorkingDir: root, entryPoints: entries, outbase: testsDir, outdir: outputDir,
      bundle: true, platform: 'node', format: 'cjs', packages: 'external',
      sourcemap: 'inline', sourcesContent: true, outExtension: { '.js': '.cjs' },
      logLevel: 'warning', tsconfig: path.join(root, 'tsconfig.json'),
    });
    return await execute(outputFiles(entries, outputDir));
  } finally {
    if (!requested) fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

try {
  process.exitCode = await run();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
