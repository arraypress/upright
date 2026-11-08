/**
 * Keeps single-key mode's content script registered for exactly the sites that are
 * both chosen in settings and granted by the user. Checking both matters: a site can be
 * revoked from chrome://extensions without touching our settings. (Modelled on Tabby's.)
 */
import { settingsStore } from './settings.js';
import { neverPatterns, originPattern } from './sites.js';

export const SCRIPT_ID = 'single-keys';
export const SCRIPT_FILE = 'content/keys-loader.js';
export const ALL_SITES = Object.freeze(['https://*/*', 'http://*/*']);

/**
 * The patterns to register for. `isGranted(patterns)` resolves whether all are held.
 * `matches` is empty when nothing should run.
 */
export async function resolveMatches(settings, isGranted) {
  if (!settings.singleKey) return { matches: [], excludeMatches: [] };
  const excludeMatches = settings.neverSites.flatMap(neverPatterns);
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

/** Bring the registration in line with settings and permissions. Calls are serialised. */
let queue = Promise.resolve();
export function syncRegistration() {
  const run = queue.then(apply, apply);
  queue = run.catch(() => {});
  return run;
}

async function apply() {
  const settings = await settingsStore.load(chrome.storage);
  const { matches, excludeMatches } = await resolveMatches(settings, (origins) => chrome.permissions.contains({ origins }));
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
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
