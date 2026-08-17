import { fillInput, prepareActionState, toggleInput } from './action-state.mjs';
import { scanActions, stateDifference, stateHash, stateSnapshot } from './action-scan.mjs';

export { scanActions, stateDifference, stateHash, stateSnapshot };

export function actionTransitioned(result, before, after) {
  return Boolean(result?.ok && !result.skipped && !result.idempotent && before !== after);
}

async function findCurrent(page, action) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actions = await scanActions(page);
    const exact = actions.find((item) => item.key === action.key);
    if (exact) return { current: exact, matchedBy: 'key' };
    const semantic = actions.filter((item) => item.signature === action.signature);
    if (semantic.length === 1) return { current: semantic[0], matchedBy: 'signature' };
    const fields = ['tag', 'aria', 'roleDescription', 'text', 'href', 'target', 'type', 'state'];
    const fallback = actions.filter((item) => fields.every((field) => item[field] === action[field]));
    if (fallback.length === 1) return { current: fallback[0], matchedBy: 'semantic' };
    await prepareActionState(page, action);
    await page.waitForTimeout(150);
  }
  return null;
}

async function selectAlternative(locator) {
  const state = await locator.evaluate((element) => ({
    value: element.value,
    values: [...element.options].filter((option) => !option.disabled).map((option) => option.value),
  }));
  const candidate = state.values.find((value) => value !== state.value);
  if (candidate === undefined) return { ok: true, skipped: true, idempotent: true, reason: 'select has no alternative option' };
  await locator.selectOption(candidate);
  return { ok: true, operation: 'select' };
}

export async function clickControl(page, locator, target) {
  if (target !== '_blank') {
    await locator.click({ timeout: 5000 });
    return { operation: 'click' };
  }
  const popupPromise = page.waitForEvent('popup', { timeout: 5000 });
  await locator.click({ timeout: 5000 });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  const popupUrl = popup.url();
  await popup.close().catch(() => {});
  return { operation: 'click', popupUrl };
}

export async function reorderSortable(page, locator) {
  const selector = '[aria-roledescription="sortable"][data-kv-verify]:not([aria-disabled="true"])';
  const parent = typeof locator.locator === 'function' ? locator.locator('xpath=..') : null;
  const peers = parent && typeof parent.locator === 'function' ? parent.locator(`:scope > ${selector}`) : page.locator(selector);
  const count = await peers.count();
  if (count < 2) return { skipped: true, idempotent: true, reason: 'sortable control has no alternative position' };
  const id = await locator.getAttribute('data-kv-verify');
  const before = await peers.evaluateAll((elements, targetId) => ({
    index: elements.findIndex((element) => element.getAttribute('data-kv-verify') === targetId),
    order: elements.map((element) => `${element.getAttribute('aria-label') || ''}|${(element.textContent || '').trim().replace(/\s+/g, ' ')}`),
  }), id);
  if (before.index < 0) return { ok: false, reason: 'sortable control is missing from its peer group' };
  const direction = before.index === count - 1 ? 'ArrowLeft' : 'ArrowRight';
  await locator.focus();
  for (const key of ['Space', direction, 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(50);
  }
  let afterOrder = before.order;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(100);
    afterOrder = await peers.evaluateAll((elements) => elements.map((element) =>
      `${element.getAttribute('aria-label') || ''}|${(element.textContent || '').trim().replace(/\s+/g, ' ')}`));
    if (JSON.stringify(afterOrder) !== JSON.stringify(before.order)) break;
  }
  if (JSON.stringify(afterOrder) === JSON.stringify(before.order)) {
    return { ok: false, reason: 'sortable keyboard interaction did not change peer order', direction, beforeOrder: before.order, afterOrder };
  }
  return { operation: 'keyboard-sort', direction, beforeOrder: before.order, afterOrder };
}

export async function performAction(page, action, fixtureFile) {
  await prepareActionState(page, action);
  const match = await findCurrent(page, action);
  if (!match) return { ok: false, reason: 'action missing during replay' };
  const { current, matchedBy } = match;
  if (current.disabled) return { ok: true, skipped: true, matchedBy, reason: 'control is disabled in this state' };
  const locator = page.locator(`[data-kv-verify="${current.id}"]`);
  if (current.roleDescription === 'sortable') {
    const result = await reorderSortable(page, locator);
    return { ok: result.ok !== false, matchedBy, ...result };
  }
  if (current.tag === 'input' && current.type === 'file') {
    await locator.setInputFiles(fixtureFile); return { ok: true, operation: 'setInputFiles', matchedBy };
  }
  if (current.tag === 'input' && ['checkbox', 'radio'].includes(current.type)) {
    return { ok: true, matchedBy, ...await toggleInput(locator, current.type) };
  }
  if (current.tag === 'input' && ['button', 'submit', 'reset'].includes(current.type)) {
    return { ok: true, matchedBy, ...await clickControl(page, locator, current.target) };
  }
  if (current.tag === 'input' || current.tag === 'textarea' || current.contenteditable) {
    return { ok: true, matchedBy, ...await fillInput(locator, current.type) };
  }
  if (current.tag === 'select') return { matchedBy, ...await selectAlternative(locator) };
  return { ok: true, matchedBy, ...await clickControl(page, locator, current.target) };
}
