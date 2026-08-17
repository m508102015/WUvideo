import crypto from 'node:crypto';

function hash(items) {
  return crypto.createHash('sha256').update(items.join('\n')).digest('hex');
}

function browserSemanticItems() {
  if (!document.body) return [];
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '<time>')
    .replace(/\b\d+(?:\.\d+)?\s*ms\b/gi, '<latency>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d.]+Z\b/g, '<timestamp>')
    .slice(0, 240);
  const attr = (element, name) => element.getAttribute(name) || '';
  const visible = (element) => {
    if (element.closest('[aria-hidden="true"],[hidden],[inert],script,style,template,noscript')) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
      && box.width > 0 && box.height > 0;
  };
  const semantic = (element) => element.matches('button,a[href],input,select,textarea,[role],[aria-label],h1,h2,h3,h4,h5,h6,p,li,label,video,audio')
    || (!element.children.length && normalize(element.textContent));
  const href = (element) => {
    const declared = attr(element, 'href');
    if (!declared) return '';
    const resolved = typeof element.href === 'string' ? element.href : declared;
    try {
      const url = new URL(resolved);
      return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
    } catch { return normalize(declared); }
  };
  const label = (element) => {
    const labelled = attr(element, 'aria-labelledby').split(/\s+/).filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || '').join(' ');
    const value = element.matches('input,select,textarea') && attr(element, 'type') !== 'password' ? element.value : '';
    return normalize(attr(element, 'aria-label') || labelled || attr(element, 'title') || attr(element, 'placeholder')
      || attr(element, 'alt') || value || element.innerText || element.textContent);
  };
  return [...document.body.querySelectorAll('*')].filter(semantic).filter(visible).map((element) => [
    element.tagName.toLowerCase(), attr(element, 'role'), label(element), href(element), attr(element, 'type'),
    element.checked ?? '', attr(element, 'aria-expanded'), attr(element, 'aria-pressed'),
    attr(element, 'aria-selected'), attr(element, 'data-state'), element.matches(':disabled'),
  ].join('|')).sort();
}

export async function semanticSnapshot(page) {
  const items = await page.evaluate(browserSemanticItems);
  return { hash: hash(items), items };
}

export function semanticDifference(expected, actual) {
  const left = new Set(expected?.items || []);
  const right = new Set(actual?.items || []);
  return {
    missing: [...left].filter((item) => !right.has(item)),
    unexpected: [...right].filter((item) => !left.has(item)),
  };
}
