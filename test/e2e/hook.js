/**
 * Test build only (scripts/build-e2e.mjs): the service worker entry, so the e2e test can
 * call exactly what a menu click or a shortcut calls (see hook-client.mjs).
 *
 * @module test/e2e/hook
 */
import { handleCommand, handleMenuClick } from './background/background.js';

/**
 * What the hook puts on the worker's globalThis.
 *
 * @typedef {object} TestHook
 * @property {typeof handleMenuClick} click What a menu click calls.
 * @property {typeof handleCommand} command What a keyboard shortcut calls.
 */

/** @type {TestHook} */
const hook = { click: handleMenuClick, command: handleCommand };
Object.assign(globalThis, { rotateImageTest: hook });
