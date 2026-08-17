import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../core/command.mjs';
import { finding } from '../core/finding.mjs';
import { relative, writeJson } from '../core/files.mjs';
import { androidTests, fileSha256, findJava17, parseAndroidVersion } from './android-config.mjs';

function addVersionFinding(ctx, version, target) {
  const ok = version.versionName === ctx.state.version && version.versionCode > 0;
  finding(ctx, {
    id: 'android.version-consistency', category: 'android', title: 'Android TV version metadata matches the web release',
    status: ok ? 'PASS' : 'FAIL', severity: 'critical', expected: `versionName ${ctx.state.version} and positive versionCode`,
    actual: JSON.stringify(version), reason: ok ? 'Android and web release identities agree.' : 'The Android artifact would publish under a stale or invalid version identity.',
    evidence: [target], remediation: 'Update Android versionName/versionCode atomically with the next approved release.',
  });
}

function addTestsFinding(ctx, tests, target) {
  finding(ctx, {
    id: 'android.tests-present', category: 'android', title: 'Android TV has executable unit or instrumentation tests',
    status: tests.length ? 'PASS' : 'FAIL', severity: 'critical', expected: 'At least one .kt/.java test under src/test or src/androidTest',
    actual: tests.length ? JSON.stringify(tests) : '0 Android test source files',
    reason: tests.length ? 'Android-specific behavior has an executable test surface.' : 'A successful empty Gradle test task is not evidence that Android behavior works.',
    evidence: [target], remediation: 'Add focused JVM and instrumentation regressions for WebView, remote control, PiP, navigation, and lifecycle behavior.',
  });
}

export async function checkAndroid(ctx) {
  const root = path.join(ctx.config.root, 'android-tv');
  const buildFile = path.join(root, 'app', 'build.gradle.kts');
  if (!fs.existsSync(buildFile)) return finding(ctx, {
    id: 'android.project', category: 'android', title: 'Android TV project is present', status: 'FAIL', severity: 'critical',
    expected: 'android-tv/app/build.gradle.kts', actual: 'missing', reason: 'Android release verification cannot run without the project.', remediation: 'Restore the Android project.',
  });
  const version = parseAndroidVersion(fs.readFileSync(buildFile, 'utf8'));
  const tests = androidTests(root).map((file) => relative(ctx.config.root, file));
  const javaHome = findJava17();
  const apk = path.join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const gradleCache = path.join(ctx.config.verifyDir, 'cache', 'gradle');
  const projectCache = path.join(gradleCache, 'project');
  const gradleHome = path.join(gradleCache, 'home');
  let gradle = null;
  if (javaHome) {
    gradle = await runCommand(ctx, 'android-gradle', './gradlew',
      ['--no-daemon', '--stacktrace', '--project-cache-dir', projectCache, 'lintDebug', 'testDebugUnitTest', 'assembleDebug'], {
        cwd: root, timeoutMs: 1_800_000, env: { JAVA_HOME: javaHome, GRADLE_USER_HOME: gradleHome },
      });
  }
  const apkHash = fs.existsSync(apk) ? fileSha256(apk) : null;
  const target = path.join(ctx.dirs.raw, 'android.json');
  writeJson(target, { version, tests, javaHome, gradle: gradle && { code: gradle.code, timedOut: gradle.timedOut,
    durationMs: gradle.durationMs, outputPath: gradle.outputPath }, apk: fs.existsSync(apk) ? relative(ctx.config.root, apk) : null, apkSha256: apkHash });
  addVersionFinding(ctx, version, target);
  addTestsFinding(ctx, tests, target);
  const buildOk = Boolean(javaHome && gradle?.code === 0 && !gradle.timedOut && apkHash);
  finding(ctx, {
    id: 'android.quality-build', category: 'android', title: 'Android lint, JVM tests, and debug APK build succeed on Java 17',
    status: buildOk ? 'PASS' : 'FAIL', severity: 'critical', expected: 'lintDebug, testDebugUnitTest, assembleDebug exit 0 and APK exists',
    actual: JSON.stringify({ javaHome, exit: gradle?.code, timedOut: gradle?.timedOut, apkSha256: apkHash }),
    reason: buildOk ? 'The Android project passed its native quality and packaging toolchain.' : 'Java 17, Gradle quality tasks, or APK production failed.',
    evidence: [target, ...(gradle ? [gradle.outputPath] : []), ...(apkHash ? [apk] : [])],
    remediation: 'Install Java 17, repair Gradle/lint/test failures, and produce a reproducible APK.', durationMs: gradle?.durationMs || 0,
  });
}
