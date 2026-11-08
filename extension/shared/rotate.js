/**
 * Turning the right-clicked image or video in its page, and the viewer's address.
 * `scripting` is chrome.scripting (passed in, so the steps stay separate from the wiring).
 *
 * @module shared/rotate
 */
import { applyPlacement, findMedia } from './page.js';
import { IDENTITY_STATE, isIdentity, placement, step } from './transform.js';

/** @import { Measurement, Update } from './page.js' */
/** @import { State } from './transform.js' */

/** @typedef {Pick<typeof chrome.scripting, 'executeScript'>} Scripting What of chrome.scripting this needs. */

/**
 * What the viewer shows: its address holds all of it.
 *
 * @typedef {object} ViewerMedia
 * @property {string} src The image or video's URL.
 * @property {'image' | 'video'} kind Which it is.
 * @property {State} state How it's turned.
 */

/**
 * One update per measured element (from findMedia): its new state and inline styles.
 * Shared by the worker (menu, shortcuts) and single-key mode in the page.
 *
 * @param {readonly Measurement[]} found - From findMedia.
 * @param {string} action - An action from transform.js.
 * @returns {Update[]} For applyPlacement, in the same order.
 */
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
 *
 * @param {Scripting} scripting - chrome.scripting.
 * @param {object} where - What to turn.
 * @param {number} where.tabId - The tab.
 * @param {number} [where.frameId] - The frame, for a menu click. Default the top frame.
 * @param {string | null} where.srcUrl - The menu's srcUrl, or null for under the pointer.
 * @param {string} where.action - An action from transform.js.
 * @returns {Promise<{ found: number, state: State }>} How many elements turned, and the state of the first.
 * @throws {Error} If Chrome won't script the page (e.g. a cross-origin frame, or an extension page).
 */
export async function rotateInPage(scripting, { tabId, frameId = 0, srcUrl, action }) {
  const target = srcUrl === null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] };
  const results = await scripting.executeScript({ target, func: findMedia, args: [srcUrl] });
  let found = 0;
  /** @type {State | null} */
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
 * The media under the pointer in any frame we can reach, for the viewer.
 *
 * @param {Scripting} scripting - chrome.scripting.
 * @param {number} tabId - The tab.
 * @returns {Promise<ViewerMedia | null>} What to open, or null if nothing's there.
 * @throws {Error} If Chrome won't script the page.
 */
export async function mediaUnderPointer(scripting, tabId) {
  const results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: findMedia, args: [null] });
  const box = results?.find(({ result }) => result?.length && result[0].src)?.result?.[0];
  if (!box) return null;
  return { src: box.src, kind: box.kind === 'video' ? 'video' : 'image', state: box.state ?? { ...IDENTITY_STATE } };
}

/**
 * How the media is turned in the page now.
 *
 * @param {Scripting} scripting - chrome.scripting.
 * @param {object} where - Which media.
 * @param {number} where.tabId - The tab.
 * @param {number} [where.frameId] - The frame. Default the top frame.
 * @param {string} where.srcUrl - The menu's srcUrl.
 * @returns {Promise<State>} Its state; upright if it isn't turned, or can't be read.
 */
export async function stateInPage(scripting, { tabId, frameId = 0, srcUrl }) {
  try {
    const [first] = await scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: findMedia,
      args: [srcUrl],
    });
    return first?.result?.[0]?.state ?? { ...IDENTITY_STATE };
  } catch {
    return { ...IDENTITY_STATE };
  }
}

/**
 * The viewer page's address: viewer/viewer.html?src=…&type=video&r=90&f=1.
 *
 * @param {string} base - The viewer page's URL (or path), without a query.
 * @param {object} media - What to show.
 * @param {string} media.src - Its URL.
 * @param {'image' | 'video'} [media.kind] - Default 'image'.
 * @param {Readonly<State>} [media.state] - Default upright.
 * @returns {string} The address.
 * @example
 * viewerUrl('viewer.html', { src: 'https://x.com/a.jpg', state: { r: 90, f: false } });
 * // 'viewer.html?src=https%3A%2F%2Fx.com%2Fa.jpg&r=90'
 */
export function viewerUrl(base, { src, kind = 'image', state = IDENTITY_STATE }) {
  const params = new URLSearchParams({ src });
  if (kind === 'video') params.set('type', 'video');
  if (!isIdentity(state)) {
    params.set('r', String(state.r));
    if (state.f) params.set('f', '1');
  }
  return `${base}?${params}`;
}

/**
 * The viewer's media from its address; bad values fall back to upright.
 *
 * @param {string} search - `location.search`.
 * @returns {ViewerMedia} What to show.
 */
export function readViewerUrl(search) {
  const params = new URLSearchParams(search);
  const r = Number(params.get('r'));
  return {
    src: params.get('src') ?? '',
    kind: params.get('type') === 'video' ? 'video' : 'image',
    state: { r: [0, 90, 180, 270].includes(r) ? r : 0, f: params.get('f') === '1' },
  };
}
