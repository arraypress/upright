/**
 * Turning the right-clicked image or video in its page, and the viewer's address.
 * `scripting` is chrome.scripting (passed in, so the steps stay separate from the wiring).
 */
import { applyPlacement, findMedia } from './page.js';
import { IDENTITY_STATE, isIdentity, placement, step } from './transform.js';

/** One update per measured element (from findMedia): its new state and inline styles. */
export function updatesFor(found, action) {
  return found.map((box) => {
    const state = step(box.state ?? IDENTITY_STATE, action);
    return { state, page: box.page, styles: placement(state, box) };
  });
}

/**
 * Apply `action` to media in the page. Two round trips: the page measures, the maths
 * happens here, the page applies.
 * - With `srcUrl` (a menu click): the media showing it, in frame `frameId`.
 * - With `srcUrl` null (a shortcut): the media under the pointer, in every frame Chrome
 *   lets us into (activeTab covers the tab's own site).
 * Resolves to { found, state }: how many elements turned and the state of the first.
 * Rejects if Chrome won't script the page (e.g. a cross-origin frame, or an extension page).
 */
export async function rotateInPage(scripting, { tabId, frameId = 0, srcUrl, action }) {
  const target = srcUrl === null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] };
  const results = await scripting.executeScript({ target, func: findMedia, args: [srcUrl] });
  let found = 0;
  let state = null;
  for (const { frameId: frame, result } of results ?? []) {
    if (!result?.length) continue;
    const updates = updatesFor(result, action);
    await scripting.executeScript({ target: { tabId, frameIds: [frame] }, func: applyPlacement, args: [updates] });
    found += result.length;
    state ??= updates[0].state;
  }
  return { found, state: state ?? step(IDENTITY_STATE, action) };
}

/**
 * The media under the pointer in any frame we can reach, as { src, kind, state } for the
 * viewer, or null if nothing's there. Rejects if Chrome won't script the page.
 */
export async function mediaUnderPointer(scripting, tabId) {
  const results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: findMedia, args: [null] });
  const box = results?.find(({ result }) => result?.length && result[0].src)?.result[0];
  if (!box) return null;
  return { src: box.src, kind: box.kind === 'video' ? 'video' : 'image', state: box.state ?? { ...IDENTITY_STATE } };
}

/** How the media is turned in the page now (identity if it isn't, or can't be read). */
export async function stateInPage(scripting, { tabId, frameId = 0, srcUrl }) {
  try {
    const [{ result: found } = {}] = await scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: findMedia,
      args: [srcUrl],
    });
    return found?.[0]?.state ?? { ...IDENTITY_STATE };
  } catch {
    return { ...IDENTITY_STATE };
  }
}

/** The viewer page's address: viewer/viewer.html?src=…&type=video&r=90&f=1. */
export function viewerUrl(base, { src, kind = 'image', state = IDENTITY_STATE }) {
  const params = new URLSearchParams({ src });
  if (kind === 'video') params.set('type', 'video');
  if (!isIdentity(state)) {
    params.set('r', String(state.r));
    if (state.f) params.set('f', '1');
  }
  return `${base}?${params}`;
}

/** The viewer's state from its address; bad values fall back to upright. */
export function readViewerUrl(search) {
  const params = new URLSearchParams(search);
  const r = Number(params.get('r'));
  return {
    src: params.get('src') ?? '',
    kind: params.get('type') === 'video' ? 'video' : 'image',
    state: { r: [0, 90, 180, 270].includes(r) ? r : 0, f: params.get('f') === '1' },
  };
}
