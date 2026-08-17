import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { walk } from '../core/files.mjs';

export function parseAndroidVersion(source) {
  return {
    versionName: source.match(/versionName\s*=\s*"([^"]+)"/)?.[1] || null,
    versionCode: Number(source.match(/versionCode\s*=\s*(\d+)/)?.[1] || 0),
  };
}

function java17Home(home) {
  if (!home || !fs.existsSync(home)) return false;
  const release = path.join(home, 'release');
  if (!fs.existsSync(release)) return false;
  return /JAVA_VERSION="17(?:\.|"|$)/.test(fs.readFileSync(release, 'utf8'));
}

export function findJava17() {
  const candidates = [
    process.env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-17-openjdk',
  ];
  return candidates.find(java17Home) || null;
}

export function androidTests(androidRoot) {
  const app = path.join(androidRoot, 'app', 'src');
  if (!fs.existsSync(app)) return [];
  return walk(app, (file) => /\/src\/(?:test|androidTest)\//.test(file) && /\.(?:kt|java)$/.test(file));
}

export function fileSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
