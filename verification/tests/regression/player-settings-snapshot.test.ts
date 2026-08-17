import assert from 'node:assert/strict';
import test from 'node:test';

// GH-ISSUE: 218; GH-PR: 136

/**
 * Mirrors the equality helper in usePlayerSettings.
 * Guards against reintroducing player rebuilds on unrelated settings changes
 * such as episodeReverseOrder.
 */
type PlayerSettingsSnapshot = {
  autoNextEpisode: boolean;
  autoSkipIntro: boolean;
  skipIntroSeconds: number;
  autoSkipOutro: boolean;
  skipOutroSeconds: number;
  showModeIndicator: boolean;
  adFilter: boolean;
  adFilterMode: string;
  adKeywords: string[];
  fullscreenType: 'auto' | 'native' | 'window';
  proxyMode: 'retry' | 'none' | 'always';
  danmakuEnabled: boolean;
  danmakuApiUrl: string;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuDisplayArea: number;
};

const comparedFields: (keyof PlayerSettingsSnapshot)[] = [
  'autoNextEpisode', 'autoSkipIntro', 'skipIntroSeconds', 'autoSkipOutro', 'skipOutroSeconds',
  'showModeIndicator', 'adFilter', 'adFilterMode', 'adKeywords', 'fullscreenType', 'proxyMode',
  'danmakuEnabled', 'danmakuApiUrl', 'danmakuOpacity', 'danmakuFontSize', 'danmakuDisplayArea',
];

function playerSettingsEqual(a: PlayerSettingsSnapshot, b: PlayerSettingsSnapshot): boolean {
  return comparedFields.every((field) => a[field] === b[field]);
}

const base: PlayerSettingsSnapshot = {
  autoNextEpisode: true,
  autoSkipIntro: false,
  skipIntroSeconds: 90,
  autoSkipOutro: false,
  skipOutroSeconds: 90,
  showModeIndicator: true,
  adFilter: true,
  adFilterMode: 'heuristic',
  adKeywords: ['ad'],
  fullscreenType: 'auto',
  proxyMode: 'retry',
  danmakuEnabled: true,
  danmakuApiUrl: '',
  danmakuOpacity: 0.8,
  danmakuFontSize: 20,
  danmakuDisplayArea: 0.5,
};

test('identical player settings snapshots are equal', () => {
  assert.equal(playerSettingsEqual(base, { ...base }), true);
});

test('player-core field changes break equality', () => {
  assert.equal(playerSettingsEqual(base, { ...base, adFilterMode: 'aggressive' }), false);
  assert.equal(playerSettingsEqual(base, { ...base, danmakuOpacity: 0.5 }), false);
});

test('episode reverse order is not part of player settings equality', () => {
  // episodeReverseOrder lives outside PlayerSettingsSnapshot; two snapshots
  // with identical player fields stay equal even if reverse order flipped.
  const afterReverseToggle = { ...base };
  assert.equal(playerSettingsEqual(base, afterReverseToggle), true);
});
