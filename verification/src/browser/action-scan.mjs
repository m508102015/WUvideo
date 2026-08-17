import crypto from 'node:crypto';
import { generatedValueRules } from './action-normalize.mjs';
import { revealActionControls } from './action-state.mjs';

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function blockingLayer() {
  const layer = (element) => element ? Math.max(Number.parseInt(getComputedStyle(element).zIndex, 10) || 0,
    layer(element.parentElement)) : 0;
  let floor = 0;
  for (const element of document.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const hidden = style.display === 'none' || style.visibility === 'hidden'
      || style.pointerEvents === 'none' || Number(style.opacity) === 0;
    const covers = box.width >= innerWidth * 0.9 && box.height >= innerHeight * 0.9;
    if (style.position === 'fixed' && !hidden && covers) floor = Math.max(floor, layer(element));
  }
  return floor;
}

function collectActions({ generatedRules, blockingZ }) {
  const selector = 'button,a[href],input,select,textarea,[role="button"],[role="link"],[data-focusable],[contenteditable="true"],[onclick]';
  const attr = (element, name) => element.getAttribute(name) || '';
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '<time>').replace(/\b\d+(?:\.\d+)?\s*ms\b/gi, '<latency>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d.]+Z\b/g, '<timestamp>')
    .slice(0, 160);
  const hiddenTree = (element) => Boolean(element.closest('[aria-hidden="true"],[hidden],[inert]'));
  const hiddenStyle = (style) => [style.display === 'none', style.visibility === 'hidden', style.pointerEvents === 'none', Number(style.opacity) === 0].some(Boolean);
  const outside = (box) => [box.bottom <= 0, box.top >= innerHeight, box.right <= 0, box.left >= innerWidth].some(Boolean);
  const fixedElement = (element, style) => [style.position, getComputedStyle(element.parentElement || element).position].includes('fixed');
  const layer = (element) => element ? Math.max(Number.parseInt(getComputedStyle(element).zIndex, 10) || 0, layer(element.parentElement)) : 0;
  const visible = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    if (hiddenTree(element)) return false;
    if (hiddenStyle(style)) return false;
    if ([box.width <= 0, box.height <= 0].some(Boolean)) return false;
    if (blockingZ > layer(element)) return false;
    if (fixedElement(element, style) && outside(box)) return false;
    if (outside(box)) return true;
    const x = Math.max(0, Math.min(innerWidth - 1, box.left + box.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, box.top + box.height / 2));
    const top = document.elementFromPoint(x, y);
    return !top || top === element || element.contains(top);
  };
  const actionable = (element) => {
    if (element.matches(selector)) return true;
    if (element.tagName === 'LABEL' || element.querySelector(selector)) return false;
    if (getComputedStyle(element).cursor !== 'pointer') return false;
    return !element.parentElement || getComputedStyle(element.parentElement).cursor !== 'pointer';
  };
  const identity = (element) => {
    const explicit = ['data-testid', 'id', 'name', 'aria-controls'].map((name) => attr(element, name)).find(Boolean);
    if (explicit) return `${element.tagName.toLowerCase()}#${normalize(explicit)}`;
    const parts = [];
    for (let current = element; current?.parentElement && current !== document.body && parts.length < 7; current = current.parentElement) {
      const siblings = [...current.parentElement.children].filter((item) => item.tagName === current.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:${siblings.indexOf(current) + 1}`);
    }
    return parts.join('>');
  };
  const stableValue = (element) => {
    const value = element.value || '';
    const pattern = generatedRules[element.id];
    return pattern && new RegExp(pattern).test(value) ? `${element.id}:<generated>` : normalize(value);
  };
  const label = (element) => {
    const labelled = attr(element, 'aria-labelledby').split(/\s+/).filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || '').join(' ');
    return normalize(attr(element, 'aria-label') || labelled || attr(element, 'title')
      || attr(element, 'placeholder') || attr(element, 'alt') || element.innerText || stableValue(element));
  };
  const selected = (element) => ['true', 'page'].includes(attr(element, 'aria-checked') || attr(element, 'aria-pressed') || attr(element, 'aria-selected') || attr(element, 'aria-current')) || (element.parentElement?.querySelectorAll('button').length > 1 && /\btext-white\b/.test(attr(element, 'class')));
  const href = (element) => {
    const raw = attr(element, 'href');
    if (!raw) return '';
    try { const url = new URL(raw, location.href); return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : `${url.origin}${url.pathname}${url.search}${url.hash}`; }
    catch { return normalize(raw); }
  };
  document.querySelectorAll('[data-kv-verify]').forEach((element) => element.removeAttribute('data-kv-verify'));
  const elements = [...document.querySelectorAll('*')].filter(actionable).filter(visible);
  const counts = new Map();
  return elements.map((element, id) => {
    const tag = element.tagName.toLowerCase();
    const disabled = element.matches(':disabled') || Boolean(element.closest('[aria-disabled="true"]'));
    const text = label(element);
    const className = normalize(attr(element, 'class'));
    const state = [stableValue(element), element.checked ?? '', attr(element, 'aria-expanded'), attr(element, 'aria-pressed'), attr(element, 'aria-selected'), attr(element, 'aria-checked'), attr(element, 'data-state'), className, disabled].join(':');
    const [target, roleDescription] = ['target', 'aria-roledescription'].map((name) => attr(element, name));
    const semanticBase = [tag, attr(element, 'role'), roleDescription, attr(element, 'aria-label'), text, href(element), target, attr(element, 'type'), state].join('|');
    const occurrence = counts.get(semanticBase) || 0;
    counts.set(semanticBase, occurrence + 1);
    const path = identity(element);
    const signature = `${semanticBase}|${occurrence}`;
    element.setAttribute('data-kv-verify', String(id));
    return { id, key: `${path}|${signature}`, signature, path, tag, text, aria: attr(element, 'aria-label'), roleDescription, href: href(element), target, type: attr(element, 'type'),
      role: attr(element, 'role'), state, className, selected: selected(element), disabled, contenteditable: element.getAttribute('contenteditable') === 'true' };
  });
}

export async function scanActions(page) {
  await revealActionControls(page);
  const blockingZ = await page.evaluate(blockingLayer);
  return page.evaluate(collectActions, { generatedRules: generatedValueRules, blockingZ });
}

function boundedSignatures(actions) {
  const counts = new Map();
  const output = new Set();
  for (const item of actions) {
    const base = item.signature.replace(/\|\d+$/, '');
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    output.add(`${base}|${Math.min(count, 1)}`);
  }
  return [...output].sort();
}

function sortableOrderSignatures(actions) {
  const groups = new Map();
  for (const item of actions.filter((action) => action.roleDescription === 'sortable')) {
    const parent = (item.path || '').replace(/>[^>]+$/, '');
    const semantic = item.signature.replace(/\|\d+$/, '');
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(semantic);
  }
  return [...groups].map(([parent, items]) => `sortable-order|${parent}|${items.join('>')}`);
}

export function stateSnapshot(url, actions) {
  const parsed = new URL(url);
  const location = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  const signatures = [...boundedSignatures(actions), ...sortableOrderSignatures(actions)].sort();
  return { hash: digest(`${location}\n${signatures.join('\n')}`), location, signatures };
}

export function stateDifference(expected, actual) {
  const left = new Set(expected?.signatures || []);
  const right = new Set(actual?.signatures || []);
  return { missing: [...left].filter((item) => !right.has(item)), unexpected: [...right].filter((item) => !left.has(item)) };
}

export function stateHash(url, actions) {
  return stateSnapshot(url, actions).hash;
}
