/**
 * Single-key mode's registration: what `wantedScript` asks for (the chosen sites Chrome has
 * granted, or all sites, less “Never on”), kept in step by the kit's `contentScriptSync` against a
 * fake `chrome.scripting` that keeps registrations as Chrome does (a duplicate or unknown id
 * refused) and can refuse a change.
 *
 * @module test/registration
 */
import { describe, expect, test } from 'vitest';
import { contentScriptSync } from '../extension/vendor/extension-kit/index.js';
import { ALL_SITES, SCRIPT_FILE, SCRIPT_ID, wantedScript } from '../extension/shared/registration.js';
import { DEFAULTS, normalizeSettings } from '../extension/shared/settings.js';

/** @import { Settings } from '../extension/shared/settings.js' */

/**
 * isGranted backed by a set of held patterns, as chrome.permissions.contains answers.
 *
 * @param {...string} held - Granted patterns.
 * @returns {(patterns: string[]) => Promise<boolean>} Whether all of `patterns` are held.
 */
const holding = (...held) => async (patterns) => patterns.every((p) => held.includes(p));
/** @param {Record<string, unknown>} changes @returns {Settings} Single-key mode on, plus `changes`. */
const on = (changes) => normalizeSettings({ singleKey: true, ...changes });

/**
 * `chrome.scripting`'s registrations, kept as Chrome keeps them.
 *
 * @returns {{ scripting: Parameters<typeof contentScriptSync>[0], scripts: Map<string, chrome.scripting.RegisteredContentScript>, refuseNext: () => void }}
 *   The fake, what it holds, and a way to have Chrome refuse the next change.
 */
function fakeScripting() {
  /** @type {Map<string, chrome.scripting.RegisteredContentScript>} */
  const scripts = new Map();
  let refuse = false;
  const change = () => {
    if (!refuse) return;
    refuse = false;
    throw new Error('Script with ID \'single-keys\' has invalid match pattern');
  };
  /** @param {string} id */
  const known = (id) => {
    if (!scripts.has(id)) throw new Error(`Nonexistent script ID '${id}'`);
  };
  const scripting = /** @type {Parameters<typeof contentScriptSync>[0]} */ (/** @type {unknown} */ ({
    getRegisteredContentScripts: async (/** @type {{ids: string[]}} */ { ids }) => ids.flatMap((id) => (scripts.has(id) ? [scripts.get(id)] : [])),
    registerContentScripts: async (/** @type {chrome.scripting.RegisteredContentScript[]} */ list) => {
      change();
      for (const script of list) if (scripts.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
      for (const script of list) scripts.set(script.id, script);
    },
    updateContentScripts: async (/** @type {chrome.scripting.RegisteredContentScript[]} */ list) => {
      change();
      for (const script of list) known(script.id);
      for (const script of list) scripts.set(script.id, { ...scripts.get(script.id), ...script });
    },
    unregisterContentScripts: async (/** @type {{ids: string[]}} */ { ids }) => {
      change();
      ids.forEach(known);
      ids.forEach((id) => scripts.delete(id));
    },
  }));
  return { scripting, scripts, refuseNext: () => { refuse = true; } };
}

describe('what is registered', () => {
  test('off, or nothing granted: nothing registered', async () => {
    expect(await wantedScript(DEFAULTS, holding(...ALL_SITES))).toBeNull();
    expect(await wantedScript(on({}), holding())).toBeNull();
  });

  test('all sites, minus the never-on list, at document start in every frame', async () => {
    expect(await wantedScript(on({ neverSites: ['youtube.com'] }), holding(...ALL_SITES))).toEqual({
      js: [SCRIPT_FILE],
      matches: [...ALL_SITES],
      excludeMatches: ['*://youtube.com/*', '*://*.youtube.com/*'],
      runAt: 'document_start',
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
    });
  });

  test('chosen sites: only those still granted (one revoked from chrome://extensions)', async () => {
    const settings = on({ singleKeyScope: 'chosen', singleKeySites: ['https://a.com', 'https://b.com'] });
    expect((await wantedScript(settings, holding('https://a.com/*')))?.matches).toEqual(['https://a.com/*']);
  });
});

describe('kept in step', () => {
  test('registered for a granted site, widened when another is granted, gone when both are revoked', async () => {
    const { scripting, scripts } = fakeScripting();
    const settings = on({ singleKeyScope: 'chosen', singleKeySites: ['https://a.com', 'https://b.com'] });
    /** @type {string[]} */
    let held = [];
    const sync = contentScriptSync(scripting, SCRIPT_ID, () => wantedScript(settings, holding(...held)));
    await sync();
    expect(scripts.size).toBe(0);
    held = ['https://a.com/*'];
    await sync();
    expect(scripts.get(SCRIPT_ID)).toMatchObject({ js: [SCRIPT_FILE], matches: ['https://a.com/*'] });
    held = ['https://a.com/*', 'https://b.com/*'];
    await sync();
    expect(scripts.get(SCRIPT_ID)?.matches).toEqual(['https://a.com/*', 'https://b.com/*']);
    held = [];
    await sync();
    expect(scripts.size).toBe(0);
  });

  test('changes made in a quick run end as the last settings say, never registered twice', async () => {
    const { scripting, scripts } = fakeScripting();
    let settings = DEFAULTS;
    const sync = contentScriptSync(scripting, SCRIPT_ID, () => wantedScript(settings, holding(...ALL_SITES)));
    settings = on({});
    const first = sync();
    const second = sync();
    settings = on({ neverSites: ['youtube.com'] });
    await Promise.all([first, second, sync()]);
    expect([...scripts.keys()]).toEqual([SCRIPT_ID]);
    expect(scripts.get(SCRIPT_ID)?.excludeMatches).toEqual(['*://youtube.com/*', '*://*.youtube.com/*']);
  });

  test('a change Chrome refuses fails that call only: the next one registers', async () => {
    const { scripting, scripts, refuseNext } = fakeScripting();
    const sync = contentScriptSync(scripting, SCRIPT_ID, () => wantedScript(on({}), holding(...ALL_SITES)));
    refuseNext();
    await expect(sync()).rejects.toThrow(/invalid match pattern/);
    expect(scripts.size).toBe(0);
    await sync();
    expect(scripts.get(SCRIPT_ID)?.matches).toEqual([...ALL_SITES]);
  });
});
