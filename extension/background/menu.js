/**
 * The right-click menu on images and videos, in the shape the settings choose:
 * - 'single': one "Rotate image" (or "Rotate video") item; each click turns a quarter
 *   turn in the chosen direction, so clicks build up (twice is 180°).
 * - 'full': a "Rotate" submenu with every action, Reset and Open in new tab.
 *
 * "Reset" is always there in the full menu. Chrome tells an extension nothing before its
 * menu shows, so hiding it for untouched media would mean remembering which page URLs
 * were turned. On media that isn't turned, Reset does nothing.
 *
 * @module background/menu
 */
import { DEFAULTS } from '../shared/settings.js';

/** @import { Settings } from '../shared/settings.js' */

/** The full menu's "Rotate" submenu. */
export const PARENT_ID = 'rotate';

/** "Open in new tab": opens the viewer rather than turning anything. */
export const OPEN_ID = 'open-in-new-tab';

/** The one-item menu's ids: one item per context, so only one ever shows. */
const SINGLE_IDS = /** @type {Readonly<Record<'image' | 'video', string>>} */ (
  Object.freeze({ image: 'rotate-image', video: 'rotate-video' })
);

/** @type {[`${chrome.contextMenus.ContextType}`, ...`${chrome.contextMenus.ContextType}`[]]} */
const CONTEXTS = ['image', 'video'];

/**
 * Full-menu items in order: [id, message name]. Ids other than OPEN_ID are actions in transform.js.
 *
 * @type {readonly [string, string | null][]}
 */
const FULL = [
  ['rotate-right', 'menuRotateRight'],
  ['rotate-left', 'menuRotateLeft'],
  ['rotate-180', 'menuRotate180'],
  ['flip-horizontal', 'menuFlipHorizontal'],
  ['flip-vertical', 'menuFlipVertical'],
  // Chrome sometimes drops separators in extension menus; the order reads fine without.
  ['separator', null],
  ['reset', 'menuReset'],
  [OPEN_ID, 'menuOpenInNewTab'],
];

/**
 * chrome.contextMenus.create properties for every item, in order.
 *
 * @param {Settings | undefined} settings - Current settings (default the defaults).
 * @param {(name: string) => string} message - chrome.i18n.getMessage.
 * @returns {chrome.contextMenus.CreateProperties[]} The items, parents first.
 */
export function menuItems(settings = DEFAULTS, message) {
  if (settings.menuStyle !== 'full') {
    // Two items, but only one ever matches what was right-clicked, so Chrome shows it
    // on its own rather than grouping it under the extension's name.
    return [
      { id: SINGLE_IDS.image, title: message('menuRotateImage'), contexts: ['image'] },
      { id: SINGLE_IDS.video, title: message('menuRotateVideo'), contexts: ['video'] },
    ];
  }
  return [
    { id: PARENT_ID, title: message('menuRotate'), contexts: CONTEXTS },
    ...FULL.map(([id, name]) => ({
      id,
      parentId: PARENT_ID,
      contexts: CONTEXTS,
      ...(name ? { title: message(name) } : { type: /** @type {const} */ ('separator') }),
    })),
  ];
}

/**
 * What a click on menu item `id` does.
 *
 * @param {string} id - The clicked item's id.
 * @param {Settings} [settings] - Current settings (default the defaults): the one item's direction.
 * @returns {string | null} An action from transform.js, OPEN_ID, or null for anything else.
 * @example
 * actionFor('rotate-image', normalizeSettings({ singleDirection: 'left' })); // 'rotate-left'
 */
export function actionFor(id, settings = DEFAULTS) {
  if (Object.values(SINGLE_IDS).includes(id)) {
    return settings.singleDirection === 'left' ? 'rotate-left' : 'rotate-right';
  }
  return FULL.some(([itemId, name]) => itemId === id && name) ? id : null;
}
