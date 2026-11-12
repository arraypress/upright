/**
 * The hint under “With one item, a click”: how to get to the viewer's flips and zoom, and to
 * Reset, with only one item on the menu. It names the keyboard shortcuts for those when both are
 * set (Chrome sets none by default: people choose their own at chrome://extensions/shortcuts),
 * and otherwise says where to set them, never naming a key that isn't set. Pure.
 *
 * @module options/single-hint
 */

/**
 * The hint's words.
 *
 * @param {readonly {name?: string, shortcut?: string}[]} commands - `chrome.commands.getAll()`.
 * @param {(key: string, substitutions?: string | string[]) => string} t - The page's words.
 * @returns {string} The hint.
 * @example
 * singleHint([{ name: 'open-viewer', shortcut: 'Ctrl+Shift+8' }, { name: 'reset', shortcut: 'Ctrl+Shift+0' }], t);
 * // '… point at it and press Ctrl+Shift+8 to open it in a new tab; Ctrl+Shift+0 resets it. …'
 * singleHint([{ name: 'open-viewer', shortcut: '' }], t); // '… or set shortcuts on Chrome’s Keyboard shortcuts page.'
 */
export function singleHint(commands, t) {
  /** @param {string} name @returns {string} The command's keys; '' when none are set. */
  const keyFor = (name) => commands.find((command) => command.name === name)?.shortcut ?? '';
  const viewer = keyFor('open-viewer');
  const reset = keyFor('reset');
  return viewer && reset ? t('optionsSingleHint', [viewer, reset]) : t('optionsSingleHintNoKeys');
}
