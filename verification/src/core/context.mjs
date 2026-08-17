import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact.mjs';

function safeRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createContext(config) {
  const runId = safeRunId();
  const artifacts = path.join(config.verifyDir, 'artifacts', runId);
  const dirs = Object.fromEntries(
    ['raw', 'screenshots', 'diffs', 'traces', 'metrics', 'media'].map((name) => {
      const target = path.join(artifacts, name);
      fs.mkdirSync(target, { recursive: true });
      return [name, target];
    }),
  );
  const ctx = {
    config,
    runId,
    artifacts,
    dirs,
    startedAt: new Date().toISOString(),
    findings: [],
    events: [],
    services: [],
    state: {},
  };
  fs.writeFileSync(path.join(artifacts, 'config.json'), JSON.stringify(redact(config), null, 2));
  return ctx;
}
