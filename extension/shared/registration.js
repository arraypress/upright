/**
 * What single-key mode's content script is registered for: exactly the sites that are
 * both chosen in settings and granted by the user. Checking both matters: a site can be
 * revoked from chrome://extensions without touching our settings. Kept in step by the
 * kit's `contentScriptSync` (in the worker).
 *
 * @module shared/registration
 */
import { hostPatterns, originPattern } from '../vendor/extension-kit/index.js';

/** @import { ContentScript } from '../vendor/extension-kit/index.js' */
/** @import { Settings } from './settings.js' */

/** The registered content script's id. */
export const SCRIPT_ID = 'single-keys';

/** The registered content script, from the extension's root. */
export const SCRIPT_FILE = 'content/keys-loader.js';

/** The host patterns for "All sites". */
export const ALL_SITES = /** @type {readonly string[]} */ (Object.freeze(['https://*/*', 'http://*/*']));

/**
 * The content script to register, or null for none.
 *
 * @param {Settings} settings - Current settings.
 * @param {(patterns: string[]) => Promise<boolean>} isGranted - Resolves whether all of `patterns` are held
 *   (chrome.permissions.contains, or a fake in tests).
 * @returns {Promise<ContentScript | null>} The script, on the chosen sites that are granted.
 */
export async function wantedScript(settings, isGranted) {
  if (!settings.singleKey) return null;
  /** @type {string[]} */
  const matches = [];
  if (settings.singleKeyScope === 'all') {
    if (await isGranted([...ALL_SITES])) matches.push(...ALL_SITES);
  } else {
    for (const origin of settings.singleKeySites) {
      const pattern = originPattern(origin);
      if (!matches.includes(pattern) && await isGranted([pattern])) matches.push(pattern);
    }
  }
  if (!matches.length) return null;
  return {
    js: [SCRIPT_FILE],
    matches,
    excludeMatches: settings.neverSites.flatMap(hostPatterns),
    // Early, so our capture listener is in before the page's own.
    runAt: 'document_start',
    // Galleries and embeds often live in frames, some of them about:blank ones.
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
  };
}
