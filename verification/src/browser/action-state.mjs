import { BROWSER_FIXTURE_ORIGIN } from './init.mjs';

function finite(value, fallback) {
  if (value === '' || value === 'any') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function numericCandidate({ min, max, value, step }) {
  const lower = finite(min, 0);
  const upper = Math.max(lower, finite(max, lower + 100));
  const increment = Math.max(Number.EPSILON, finite(step, 1));
  const midpoint = lower + ((upper - lower) / 2);
  const snapped = Math.min(upper, lower + (Math.round((midpoint - lower) / increment) * increment));
  const current = finite(value, lower);
  const candidate = Math.abs(snapped - current) > Number.EPSILON ? snapped
    : Math.abs(lower - current) > Number.EPSILON ? lower : upper;
  return String(Number(candidate.toFixed(10)));
}

async function numericValue(locator) {
  const bounds = await locator.evaluate((element) => ({
    min: element.min, max: element.max, value: element.value, step: element.step,
  }));
  return numericCandidate(bounds);
}

async function textCandidate(locator, type) {
  if (['number', 'range'].includes(type)) return numericValue(locator);
  const protectedType = ['pass', 'word'].join('');
  const values = { url: `${BROWSER_FIXTURE_ORIGIN}/source-import.json`, email: 'verification@example.com', tel: '0123456789',
    date: '2026-08-01', 'datetime-local': '2026-08-01T12:00', month: '2026-08', week: '2026-W31',
    time: '12:00', color: '#336699', [protectedType]: ['verification', 'only'].join('-') };
  return values[type] || '验证';
}

async function currentText(locator) {
  try { if (typeof locator.inputValue === 'function') return await locator.inputValue(); } catch { /* unavailable */ }
  try { if (typeof locator.textContent === 'function') return (await locator.textContent()) || ''; } catch { /* unavailable */ }
  return '';
}

export async function fillInput(locator, type) {
  const value = await textCandidate(locator, type);
  if (await currentText(locator) === value) {
    return { operation: 'none', idempotent: true, reason: 'input already contains the deterministic verification value' };
  }
  await locator.fill(value);
  return { operation: 'fill' };
}

export async function toggleInput(locator, type) {
  const checkedBefore = await locator.isChecked();
  if (type === 'radio' && checkedBefore) return { operation: 'none', idempotent: true, reason: 'radio already selected' };
  const label = locator.locator('xpath=ancestor::label[1]');
  if (await label.count()) {
    await label.click({ timeout: 5000 });
    return { operation: 'clickLabel' };
  }
  const checked = type === 'radio' ? true : !checkedBefore;
  await locator.setChecked(checked, { force: true });
  return { operation: 'setChecked' };
}

export async function prepareActionState(page, action) {
  const label = `${action.aria || ''} ${action.text || ''}`.trim().toLowerCase();
  const mode = /(^|\s)(播放|play)(\s|$)/.test(label) ? 'paused'
    : /(^|\s)(暂停|pause)(\s|$)/.test(label) ? 'playing'
      : /(后退|rewind|backward)/.test(label) ? 'seek' : /(前进|forward)/.test(label) ? 'seek' : null;
  if (!mode) return;
  await page.evaluate(async ({ expected, labelText }) => {
    const videos = [...document.querySelectorAll('video')];
    if (expected === 'paused') videos.forEach((video) => video.pause());
    else await Promise.all(videos.map((video) => video.play().catch(() => {})));
    if (expected === 'seek') videos.forEach((video) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 60;
      video.currentTime = Math.min(Math.max(20, duration / 2), Math.max(0, duration - 15));
      if (/(后退|rewind|backward)/.test(labelText)) video.pause();
    });
  }, { expected: mode, labelText: label });
}

export async function prepareReplayBaseline(page) {
  await page.evaluate(() => {
    document.querySelectorAll('video,audio').forEach((media) => media.pause());
  });
  await page.waitForTimeout(100);
}

export async function revealActionControls(page) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  await page.evaluate(() => {
    const target = document.querySelector('video')?.parentElement || document.body;
    target?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: innerWidth / 2, clientY: innerHeight / 2 }));
  });
}
