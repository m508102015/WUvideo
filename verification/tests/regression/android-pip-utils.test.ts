import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAndroidPiPTransitionPlan,
  shouldRestoreInlineAfterAndroidPiP,
  shouldRollbackTemporaryWindowFullscreen,
} from '../../../components/player/hooks/desktop/android-pip-utils';

// GH-ISSUE: 142,159; GH-PR: 156,162

function assertTransition(mode: 'none' | 'window' | 'native', temporary: boolean) {
  const plan = createAndroidPiPTransitionPlan(mode);
  assert.deepEqual(plan, {
    enterTemporaryWindowFullscreen: temporary,
    restoreInlineOnExit: temporary,
  });
  assert.equal(
    shouldRestoreInlineAfterAndroidPiP({
      enteredTemporaryWindowFullscreen: plan.enterTemporaryWindowFullscreen,
      restoreInlineOnExit: plan.restoreInlineOnExit,
    }, false),
    temporary
  );
}

const transitionCases = [
  ['inline playback enters temporary window fullscreen and restores inline after PiP closes', 'none', true],
  ['existing page fullscreen stays in page fullscreen after PiP closes', 'window', false],
  ['system fullscreen also restores inline after PiP closes', 'native', true],
] as const;

for (const [name, mode, temporary] of transitionCases) {
  test(name, () => assertTransition(mode, temporary));
}

test('temporary page fullscreen rolls back when Android PiP entry fails', () => {
  assert.equal(
    shouldRollbackTemporaryWindowFullscreen({
      enteredTemporaryWindowFullscreen: true,
      restoreInlineOnExit: true,
    }),
    true
  );

  assert.equal(
    shouldRollbackTemporaryWindowFullscreen({
      enteredTemporaryWindowFullscreen: false,
      restoreInlineOnExit: false,
    }),
    false
  );
});
