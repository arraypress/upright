/**
 * Calling the e2e build's test hook (test/e2e/hook.js) from Playwright: exactly what a click
 * on one of Upright's menu items, or a keyboard shortcut, calls in the service worker.
 * Chrome's native menu and shortcuts can't be driven headlessly. Used by the e2e test and
 * the store screenshots.
 *
 * @module test/e2e/hook-client
 */

/** @import { Worker } from 'playwright' */
/** @import { TestHook } from './hook.js' */

/**
 * The menu click Chrome would report (the parts Upright reads).
 *
 * @typedef {object} MenuClick
 * @property {string} menuItemId The item's id.
 * @property {string} srcUrl The right-clicked media's URL.
 * @property {string} pageUrl The page's URL; finds the tab when none is given.
 * @property {number} [frameId] The frame it was in. Default the top frame.
 * @property {'image' | 'video'} [mediaType] Default image.
 */

/**
 * Handles on the hook in the extension's service worker.
 *
 * @param {Worker} worker - The e2e build's service worker.
 * @returns {{
 *   click: (info: MenuClick, tab?: chrome.tabs.Tab) => Promise<void>,
 *   command: (name: string, tab?: chrome.tabs.Tab) => Promise<void>,
 * }} `click` calls what the menu calls (in the tab showing `info.pageUrl` unless `tab` is given);
 *   `command` what a shortcut calls.
 */
export function testHook(worker) {
  return {
    click: (info, tab) => worker.evaluate(async ([info, tab]) => {
      const hook = /** @type {typeof globalThis & { rotateImageTest: TestHook }} */ (globalThis).rotateImageTest;
      const clickData = { frameId: 0, mediaType: /** @type {const} */ ('image'), editable: false, ...info };
      await hook.click(clickData, tab ?? (await chrome.tabs.query({ url: info.pageUrl }))[0]);
    }, /** @type {const} */ ([info, tab])),
    command: (name, tab) => worker.evaluate(async ([name, tab]) => {
      const hook = /** @type {typeof globalThis & { rotateImageTest: TestHook }} */ (globalThis).rotateImageTest;
      await hook.command(name, tab);
    }, /** @type {const} */ ([name, tab])),
  };
}
