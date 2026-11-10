/**
 * Keeps single-key mode's content script registered for exactly the sites that are
 * both chosen in settings and granted by the user. Checking both matters: a site can be
 * revoked from chrome://extensions without touching our settings. (Modelled on Tabby's.)
 *
 * @module shared/registration
 */
import { settingsStore } from './settings.js';
import { hostPatterns, originPattern } from '../vendor/extension-kit/index.js';

/** @import { Settings } from './settings.js' */

/** The registered content script's id. */
const SCRIPT_ID = 'single-keys';

/** The registered content script, from the extension's root. */
export const SCRIPT_FILE = 'content/keys-loader.js';

/** The host patterns for "All sites". */
export const ALL_SITES = /** @type {readonly string[]} */ (Object.freeze(['https://*/*', 'http://*/*']));

/**
 * The patterns to register for.
 *
 * @param {Settings} settings - Current settings.
 * @param {(patterns: string[]) => Promise<boolean>} isGranted - Resolves whether all of `patterns` are held
 *   (chrome.permissions.contains, or a fake in tests).
 * @returns {Promise<{ matches: string[], excludeMatches: string[] }>} `matches` is empty when nothing should run.
 */
export async function resolveMatches(settings, isGranted) {
  if (!settings.singleKey) return { matches: [], excludeMatches: [] };
  const excludeMatches = settings.neverSites.flatMap(hostPatterns);
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
  return { matches, excludeMatches: matches.length ? excludeMatches : [] };
}

/** The last registration change, so the next waits for it. */
let queue = Promise.resolve();

/**
 * Bring the registration in line with settings and permissions. Calls are serialised,
 * so a quick run of changes can't register and unregister out of order.
 *
 * @returns {Promise<void>} Settles once this call's change is made.
 * @throws {Error} If Chrome refuses the change.
 */
export function syncRegistration() {
  const run = queue.then(apply, apply);
  queue = run.catch(() => {});
  return run;
}

/**
 * Register, update or unregister the content script to match settings and permissions.
 *
 * @returns {Promise<void>}
 */
async function apply() {
  const settings = await settingsStore.load(chrome.storage);
  const { matches, excludeMatches } = await resolveMatches(settings, (origins) => chrome.permissions.contains({ origins }));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  /** @type {chrome.scripting.RegisteredContentScript} */
  const script = {
    id: SCRIPT_ID,
    js: [SCRIPT_FILE],
    matches,
    excludeMatches,
    // Early, so our capture listener is in before the page's own.
    runAt: 'document_start',
    // Galleries and embeds often live in frames, some of them about:blank ones.
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true,
  };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}
