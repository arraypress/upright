/**
 * Single-key mode's content script. Chrome registers content scripts as classic scripts,
 * so this loads the real code (keys.js) as a module, sharing page.js and transform.js
 * with the menu and shortcuts rather than keeping a copy.
 *
 * @module content/keys-loader
 */
import(chrome.runtime.getURL('content/keys.js')).catch((error) => console.debug('Upright keys:', error));
