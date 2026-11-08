/**
 * Upright's settings: what they are, their defaults, which are tied to one
 * computer, and how anything read from storage or the options page becomes
 * valid settings.
 *
 * Most live in chrome.storage.sync, one item per setting (the store is
 * @arraypress/extension-kit's), so they follow the user to their other
 * computers through their own Chrome Sync, like Chrome's own settings. They
 * are plain preferences (menu style, direction, keys, sites to leave alone),
 * not personal data, and Chrome Sync keeps them in the user's own Google
 * account: the developer receives nothing, so "no data collected" stays true.
 *
 * chrome.storage.local holds what is tied to one computer: single-key mode,
 * where it runs and the chosen sites, which only work with site access, and
 * Chrome grants that per computer, from a click on that computer.
 *
 * The single-key content script imports this, so it takes the store module
 * itself rather than the kit's index: every file it loads must be listed as
 * web accessible in the manifest.
 *
 * @module shared/settings
 */

import { createSettingsStore } from '../vendor/extension-kit/settings/store.js';
import { neverHost, siteOrigin } from './sites.js';

/**
 * @typedef {object} Settings
 * @property {'single' | 'full'} menuStyle 'single': one "Rotate image" item that turns 90° per click; 'full': the "Rotate ▸" submenu.
 * @property {'right' | 'left'} singleDirection Which way the single item turns: 'right' (clockwise) or 'left'.
 * @property {boolean} singleKey Single-key mode: R, L and 0 over media, with no modifier. Needs host permissions.
 * @property {'all' | 'chosen'} singleKeyScope Where single-key mode runs: all sites or the chosen ones.
 * @property {string[]} singleKeySites Origins for 'chosen' ("https://example.com").
 * @property {boolean} extraKeys H and V flip, too. Off by default: more keys, more clashes with sites' own.
 * @property {string[]} neverSites Hosts single-key mode never runs on, subdomains included ("youtube.com").
 */

/** Every setting's default. */
export const DEFAULTS = /** @type {Readonly<Settings>} */ (Object.freeze({
  menuStyle: 'single',
  singleDirection: 'right',
  singleKey: false,
  singleKeyScope: 'all',
  singleKeySites: [],
  extraKeys: false,
  neverSites: [],
}));

/**
 * A list setting: each item cleaned, junk and repeats dropped.
 *
 * @param {unknown} value - What storage or the form held.
 * @param {(item: string) => string | null} clean - One item's clean form, or null to drop it.
 * @returns {string[]} The clean list; not an array gives an empty one.
 */
function list(value, clean) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (typeof item === 'string' ? clean(item) : null)).filter((item) => item !== null))];
}

/**
 * Coerce anything read from storage (or a form) into valid settings: a choice
 * not offered, or a value of the wrong type, falls back to the default; sites
 * are cleaned to origins and hosts.
 *
 * @param {Record<string, unknown>} [raw] - Stored or typed values; missing ones take the default.
 * @returns {Settings} Valid settings.
 * @example
 * normalizeSettings({ neverSites: ['https://www.YouTube.com/watch'] }).neverSites; // ['youtube.com']
 */
export function normalizeSettings(raw = {}) {
  /**
   * @template {string} T
   * @param {'menuStyle' | 'singleDirection' | 'singleKeyScope'} key
   * @param {readonly T[]} allowed
   * @returns {T}
   */
  const choice = (key, allowed) => (allowed.includes(/** @type {T} */ (raw[key])) ? /** @type {T} */ (raw[key]) : /** @type {T} */ (DEFAULTS[key]));
  /** @param {'singleKey' | 'extraKeys'} key @returns {boolean} */
  const flag = (key) => (typeof raw[key] === 'boolean' ? raw[key] : DEFAULTS[key]);
  return {
    menuStyle: choice('menuStyle', ['single', 'full']),
    singleDirection: choice('singleDirection', ['right', 'left']),
    singleKey: flag('singleKey'),
    singleKeyScope: choice('singleKeyScope', ['all', 'chosen']),
    singleKeySites: list(raw.singleKeySites, siteOrigin),
    extraKeys: flag('extraKeys'),
    neverSites: list(raw.neverSites, neverHost),
  };
}

/** Loading, saving and change detection, over `chrome.storage` (or a fake in tests). */
export const settingsStore = createSettingsStore({
  defaults: DEFAULTS,
  normalize: normalizeSettings,
  localKeys: ['singleKey', 'singleKeyScope', 'singleKeySites'],
});
