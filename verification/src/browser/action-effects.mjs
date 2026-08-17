import { semanticSnapshot } from './semantic.mjs';

const errorFields = ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors'];

function observedCounts(observed) {
  return {
    requests: observed.requestCount || 0,
    responses: observed.responseCount || 0,
    dialogs: observed.dialogs.length,
    downloads: observed.downloads.length,
    fileChoosers: observed.fileChoosers?.length || 0,
    popups: observed.popups.length,
    abortedRequests: observed.abortedRequests?.length || 0,
    ...Object.fromEntries(errorFields.map((name) => [name, observed[name].length])),
  };
}

export function browserEvidence(scope = globalThis) {
  const storage = (name) => {
    try {
      const target = scope[name];
      return Object.keys(target).sort().map((key) => [key, target.getItem(key)]);
    } catch (error) {
      return [['<unavailable>', `${error?.name || 'Error'}: ${error?.message || String(error)}`]];
    }
  };
  const document = scope.document;
  const media = [...document.querySelectorAll('video,audio')].map((element) => ({
    paused: element.paused,
    muted: element.muted,
    volume: Number(element.volume.toFixed(3)),
    playbackRate: Number(element.playbackRate.toFixed(3)),
    currentTime: Number(element.currentTime.toFixed(2)),
    currentSrc: element.currentSrc,
    readyState: element.readyState,
    error: element.error?.message || null,
  }));
  const rootStyle = scope.getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? scope.getComputedStyle(document.body) : null;
  return {
    url: `${scope.location.pathname}${scope.location.search}${scope.location.hash}`,
    localStorage: storage('localStorage'),
    sessionStorage: storage('sessionStorage'),
    clipboard: scope.__kvClipboard || '',
    display: { rootClass: document.documentElement.className, theme: document.documentElement.getAttribute('data-theme') || '',
      colorScheme: rootStyle.colorScheme, bodyColor: bodyStyle?.color || '',
      bodyBackground: bodyStyle?.backgroundColor || '' },
    media,
  };
}

export async function captureActionEvidence(page, observed, actionState) {
  const [pageState, dom] = await Promise.all([page.evaluate(browserEvidence), semanticSnapshot(page)]);
  const observedEvents = Object.fromEntries([...errorFields, 'abortedRequests'].map((name) => [name, observed[name] || []]));
  return { ...pageState, dom, actionState, observed: observedCounts(observed), observedEvents };
}

function changed(before, after, field) {
  return JSON.stringify(before[field]) !== JSON.stringify(after[field]);
}

function mediaLabel(action) {
  return `${action.aria || ''} ${action.text || ''}`.trim().toLowerCase();
}

function mediaProof(action, before, after) {
  const label = mediaLabel(action);
  const left = before.media[0];
  const right = after.media[0];
  if (!left || !right) return null;
  const transition = { before: { currentTime: left.currentTime, paused: left.paused }, after: { currentTime: right.currentTime, paused: right.paused } };
  if (/(后退|rewind|backward)/.test(label)) return { kind: 'seek-backward', ok: right.currentTime <= left.currentTime - 5, ...transition };
  if (/(前进|forward)/.test(label)) return { kind: 'seek-forward', ok: right.currentTime >= left.currentTime + 5, ...transition };
  if (/(^|\s)(播放|play)(\s|$)/.test(label)) return { kind: 'play', ok: !right.paused, ...transition };
  if (/(^|\s)(暂停|pause)(\s|$)/.test(label)) return { kind: 'pause', ok: right.paused, ...transition };
  return null;
}

function runtimeDelta(before, after) {
  return errorFields.flatMap((field) => {
    const count = Math.max(0, after.observed[field] - before.observed[field]);
    const events = after.observedEvents?.[field]?.slice(before.observed[field]) || [];
    return count ? [{ field, count, events }] : [];
  });
}

function observableEffects(before, after) {
  const effects = [];
  if (before.actionState.hash !== after.actionState.hash) effects.push('control-state');
  if (before.dom.hash !== after.dom.hash) effects.push('visible-dom');
  for (const field of ['url', 'localStorage', 'sessionStorage', 'clipboard', 'display']) if (changed(before, after, field)) effects.push(field);
  const mediaBefore = before.media.map((item) => [item.paused, item.muted, item.volume, item.playbackRate, item.currentSrc, item.error]);
  const mediaAfter = after.media.map((item) => [item.paused, item.muted, item.volume, item.playbackRate, item.currentSrc, item.error]);
  if (JSON.stringify(mediaBefore) !== JSON.stringify(mediaAfter)) effects.push('media-state');
  for (const field of ['requests', 'responses', 'dialogs', 'downloads', 'fileChoosers', 'popups']) {
    if (after.observed[field] > before.observed[field]) effects.push(field);
  }
  return effects;
}

function idempotentReason(action, before, after) {
  if (action.selected) return 'control is already the visibly selected choice';
  if (!action.href || before.url !== after.url) return '';
  try {
    const base = new URL(before.url, 'https://verification.invalid');
    return new URL(action.href, base).href === base.href ? 'link already targets the current location' : '';
  } catch { return ''; }
}

export function assessAction(action, interaction, before, after) {
  if (!interaction.ok) return { ok: false, failureKind: 'automation', reason: interaction.reason, effects: [], stateChanged: false };
  if (interaction.skipped || interaction.idempotent) {
    return { ok: true, idempotent: true, reason: interaction.reason, effects: [], stateChanged: false };
  }
  const effects = observableEffects(before, after);
  const runtimeErrors = runtimeDelta(before, after);
  if (runtimeErrors.length) return { ok: false, failureKind: 'runtime', reason: 'interaction emitted a runtime or network error', effects, runtimeErrors,
    stateChanged: before.actionState.hash !== after.actionState.hash };
  const proof = mediaProof(action, before, after);
  if (proof && !proof.ok) return { ok: false, failureKind: 'media-proof', reason: `${proof.kind} did not produce the required media transition`, effects, proof,
    stateChanged: before.actionState.hash !== after.actionState.hash };
  if (proof?.ok) effects.push(`media-${proof.kind}`);
  if (!effects.length) {
    const reason = idempotentReason(action, before, after);
    if (reason) return { ok: true, idempotent: true, reason, effects, proof, stateChanged: false };
    return { ok: false, failureKind: 'no-effect', reason: 'interaction produced no observable DOM, state, storage, media, network, dialog, download, popup, or navigation effect',
      effects, proof, stateChanged: false };
  }
  return { ok: true, effects, proof, stateChanged: before.actionState.hash !== after.actionState.hash };
}
