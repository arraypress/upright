/**
 * The right-click menu on images and videos, in the shape the settings choose:
 * - 'single': one "Rotate image" (or "Rotate video") item; each click turns a quarter
 *   turn in the chosen direction, so clicks build up (twice is 180°).
 * - 'full': a "Rotate" submenu with every action, Reset and Open in new tab.
 *
 * "Reset" is always there in the full menu. Chrome tells an extension nothing before its
 * menu shows, so hiding it for untouched media would mean remembering which page URLs
 * were turned. On media that isn't turned, Reset does nothing.
 */
import { DEFAULTS } from '../shared/settings.js';

export const PARENT_ID = 'rotate';
export const OPEN_ID = 'open-in-new-tab';
export const SINGLE_IDS = Object.freeze({ image: 'rotate-image', video: 'rotate-video' });
const CONTEXTS = ['image', 'video'];

/** Full-menu items in order: [id, message name]. Ids other than OPEN_ID are actions in transform.js. */
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

/** chrome.contextMenus.create properties for every item. `message(name)` is chrome.i18n.getMessage. */
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
      ...(name ? { title: message(name) } : { type: 'separator' }),
    })),
  ];
}

/** What a click on menu item `id` does: an action from transform.js, OPEN_ID, or null. */
export function actionFor(id, settings = DEFAULTS) {
  if (Object.values(SINGLE_IDS).includes(id)) {
    return settings.singleDirection === 'left' ? 'rotate-left' : 'rotate-right';
  }
  return FULL.some(([itemId, name]) => itemId === id && name) ? id : null;
}
