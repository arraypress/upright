/**
 * Single-key mode, in the page: R, L and 0 (and H, V if switched on) turn the media
 * under the pointer. Loaded by keys-loader.js into the content script's isolated world.
 *
 * @module content/keys
 */
import { applyPlacement, findMedia } from '../shared/page.js';
import { updatesFor } from '../shared/rotate.js';
import { settingsStore } from '../shared/settings.js';

/** @import { Settings } from '../shared/settings.js' */

/** @type {Readonly<Record<string, string>>} */
const KEYS = { r: 'rotate-right', l: 'rotate-left', 0: 'reset' };
/** @type {Readonly<Record<string, string>>} */
const EXTRA_KEYS = { h: 'flip-horizontal', v: 'flip-vertical' };

/**
 * The action for a keydown. Any modifier, a held key or an IME composition means it
 * isn't ours.
 *
 * @param {KeyboardEvent} event - The keydown.
 * @param {Pick<Settings, 'extraKeys'>} settings - Whether H and V count.
 * @returns {string | null} An action from transform.js, or null.
 */
function keyAction(event, { extraKeys }) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || event.isComposing) return null;
  const key = event.key?.toLowerCase();
  return KEYS[key] ?? (extraKeys ? EXTRA_KEYS[key] : null) ?? null;
}

/**
 * Whether the key is going into something the user types in.
 *
 * @param {EventTarget | undefined} target - The keydown's real target.
 * @returns {boolean} True in fields, editable content and text boxes.
 */
function isTyping(target) {
  if (!(target instanceof Element)) return false;
  return (target instanceof HTMLElement && target.isContentEditable) ||
    Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
}

let settings = await settingsStore.load(chrome.storage);
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (settingsStore.changed(changes, area).length) settings = await settingsStore.load(chrome.storage);
});

addEventListener('keydown', (event) => {
  const action = keyAction(event, settings);
  // composedPath()[0]: the real target, even inside a shadow root.
  if (!action || isTyping(event.composedPath()[0])) return;
  const found = findMedia(null);
  if (!found.length) return; // Nothing hovered: the key is the page's.
  applyPlacement(updatesFor(found, action));
  // Only now, so sites' own shortcuts work whenever we didn't act.
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
