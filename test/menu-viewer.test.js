/**
 * The right-click menu, the manifest, settings, single-key registration, and the
 * viewer's address, zoom and saved-copy names.
 *
 * @module test/menu-viewer
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_LIST_MESSAGES } from '@arraypress/extension-kit';
import { actionFor, menuItems, OPEN_ID, PARENT_ID } from '../extension/background/menu.js';
import { ALL_SITES, resolveMatches } from '../extension/shared/registration.js';
import { DEFAULTS, normalizeSettings } from '../extension/shared/settings.js';
import { readViewerUrl, viewerUrl } from '../extension/shared/rotate.js';
import { ACTIONS } from '../extension/shared/transform.js';
import { copyFile, fitZoom, mediaName, nextZoom } from '../extension/viewer/viewer-math.js';

/** @import { Settings } from '../extension/shared/settings.js' */

/**
 * @param {string} name - A locale folder, e.g. "en_GB".
 * @returns {Record<string, { message: string, placeholders?: Record<string, { content: string }> }>} Its messages.json.
 */
const locale = (name) => JSON.parse(readFileSync(new URL(`../extension/_locales/${name}/messages.json`, import.meta.url), 'utf8'));
const en = locale('en');
/** @param {string} name @returns {string} The English message, or '' (as chrome.i18n.getMessage). */
const message = (name) => en[name]?.message ?? '';

describe('menu', () => {
  const full = menuItems(normalizeSettings({ menuStyle: 'full' }), message);

  test('by default, one "Rotate image" item (or "Rotate video"), each on its own context', () => {
    expect(menuItems(DEFAULTS, message)).toEqual([
      { id: 'rotate-image', title: 'Rotate image', contexts: ['image'] },
      { id: 'rotate-video', title: 'Rotate video', contexts: ['video'] },
    ]);
  });

  test('the one item turns the way the setting says', () => {
    expect(actionFor('rotate-image', DEFAULTS)).toBe('rotate-right');
    expect(actionFor('rotate-video', normalizeSettings({ singleDirection: 'left' }))).toBe('rotate-left');
  });

  test('full menu: one "Rotate" submenu on images and videos, worded like Chrome', () => {
    expect(full[0]).toEqual({ id: PARENT_ID, title: 'Rotate', contexts: ['image', 'video'] });
    expect(full.slice(1).every((item) => item.parentId === PARENT_ID)).toBe(true);
    expect(full.filter((item) => item.title).map((item) => item.title)).toEqual([
      'Rotate', 'Rotate clockwise', 'Rotate counterclockwise', 'Rotate 180°',
      'Flip horizontally', 'Flip vertically', 'Reset', 'Open in new tab',
    ]);
  });

  test('full menu: every item is an action the transform maths knows, or the viewer', () => {
    const ids = full.filter((item) => item.title && item.id !== PARENT_ID).map((item) => item.id);
    expect(ids.filter((id) => id !== OPEN_ID)).toEqual(ACTIONS);
    for (const id of ids) expect(actionFor(String(id), DEFAULTS)).toBe(id);
    expect(actionFor('separator', DEFAULTS)).toBeNull();
  });

  test('every message used by the extension exists in English; British English only overrides', () => {
    const sources = ['background/menu.js', 'viewer/viewer.js', 'viewer/viewer.html', 'options/options.html', 'options/options.js', 'manifest.json']
      .map((file) => readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8')).join('\n');
    const used = new Set([...sources.matchAll(/['"_]((?:menu|viewer|ext|options|command)[A-Z][A-Za-z0-9]+)/g)].map((m) => m[1])
      .filter((name) => !(name in DEFAULTS))); // Setting names, like menuStyle, aren't messages.
    // The site lists' words (Add buttons' lists: no Remove label), which the kit reads.
    for (const key of Object.values(SITE_LIST_MESSAGES).filter((key) => key !== SITE_LIST_MESSAGES.removeLabel)) used.add(key);
    expect(used.size).toBeGreaterThan(40);
    for (const name of used) expect(en, name).toHaveProperty(name);
    for (const name of Object.keys(locale('en_GB'))) expect(en, name).toHaveProperty(name);
    expect(locale('en_GB').menuRotateLeft.message).toBe('Rotate anti-clockwise');
  });

  test('the name is in one place, extShortName (and the store name); other messages take it as $NAME$', () => {
    const naming = Object.keys(en).filter((key) => en[key].message.includes(en.extShortName.message));
    expect(naming.sort()).toEqual(['extName', 'extShortName']);
    for (const key of ['optionsTitle', 'optionsAboutHeading', 'optionsGetHelp']) expect(en[key].placeholders, key).toEqual({ name: { content: '$1' } });
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

  test('four shortcuts (Chrome allows at most four suggested keys), Alt+Shift+V opens the viewer', () => {
    /** @type {Record<string, { suggested_key?: { default?: string } }>} */
    const commands = manifest.commands;
    const keys = Object.fromEntries(Object.entries(commands).map(([name, c]) => [name, c.suggested_key?.default]));
    expect(keys).toEqual({ 'rotate-right': 'Alt+Shift+R', 'rotate-left': 'Alt+Shift+L', reset: 'Alt+Shift+0', 'open-viewer': 'Alt+Shift+V' });
  });

  test('named Upright, with no host permissions at install', () => {
    expect(en.extName.message).toBe('Upright – Rotate Images & Videos');
    expect(en.extShortName.message).toBe('Upright');
    expect(manifest.short_name).toBe('__MSG_extShortName__');
    // The manifest can't fill a placeholder: the toolbar button's tooltip is the name itself, as Chrome's default.
    expect(manifest.action.default_title).toBe('__MSG_extShortName__');
    expect(manifest.host_permissions).toBeUndefined();
  });
});

describe('settings', () => {
  test('anything stored is coerced to valid settings', () => {
    expect(normalizeSettings({ menuStyle: 'huge', singleKey: 'yes', singleKeySites: ['Example.com/x', 'nope', 3], neverSites: ['https://www.YouTube.com/watch', 'youtube.com'] }))
      .toEqual({ ...DEFAULTS, singleKeySites: ['https://example.com'], neverSites: ['youtube.com'] });
  });
});

describe('single-key registration', () => {
  /**
   * isGranted backed by a set of held patterns, as chrome.permissions.contains answers.
   *
   * @param {...string} held - Granted patterns.
   * @returns {(patterns: string[]) => Promise<boolean>} Whether all of `patterns` are held.
   */
  const holding = (...held) => async (patterns) => patterns.every((p) => held.includes(p));
  /** @param {Record<string, unknown>} changes @returns {Settings} Single-key mode on, plus `changes`. */
  const on = (changes) => normalizeSettings({ singleKey: true, ...changes });

  test('off, or nothing granted: nothing registered', async () => {
    expect(await resolveMatches(DEFAULTS, holding(...ALL_SITES))).toEqual({ matches: [], excludeMatches: [] });
    expect((await resolveMatches(on({}), holding())).matches).toEqual([]);
  });

  test('all sites, minus the never-on list', async () => {
    expect(await resolveMatches(on({ neverSites: ['youtube.com'] }), holding(...ALL_SITES))).toEqual({
      matches: [...ALL_SITES], excludeMatches: ['*://youtube.com/*', '*://*.youtube.com/*'],
    });
  });

  test('chosen sites: only those still granted (one revoked from chrome://extensions)', async () => {
    const settings = on({ singleKeyScope: 'chosen', singleKeySites: ['https://a.com', 'https://b.com'] });
    expect((await resolveMatches(settings, holding('https://a.com/*'))).matches).toEqual(['https://a.com/*']);
  });
});

describe('viewer address', () => {
  test('round-trips the source, kind and state', () => {
    const media = { src: 'https://example.com/a b.jpg?x=1&y=2', kind: /** @type {const} */ ('video'), state: { r: 270, f: true } };
    const url = viewerUrl('chrome-extension://id/viewer/viewer.html', media);
    expect(url).toBe('chrome-extension://id/viewer/viewer.html?src=https%3A%2F%2Fexample.com%2Fa+b.jpg%3Fx%3D1%26y%3D2&type=video&r=270&f=1');
    expect(readViewerUrl(new URL(url).search)).toEqual(media);
  });

  test('bad values fall back to upright', () => {
    expect(readViewerUrl('?src=x&r=45&f=yes').state).toEqual({ r: 0, f: false });
  });
});

describe('viewer zoom and saving', () => {
  test('zoom steps follow Chrome\'s levels, from any fitted zoom', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(0.4137, 1)).toBe(0.5);
    expect(nextZoom(0.67, -1)).toBe(0.5);
    expect(nextZoom(5, 1)).toBe(5);
  });

  test('fit uses the turned size and never enlarges', () => {
    expect(fitZoom([4000, 3000], { r: 90 }, [1000, 1000])).toBe(0.25);
    expect(fitZoom([4000, 3000], { r: 0 }, [1000, 1000])).toBe(0.25);
    expect(fitZoom([400, 100], { r: 90 }, [1000, 200])).toBe(0.5);
    expect(fitZoom([40, 30], { r: 0 }, [1000, 1000])).toBe(1);
  });

  test('a saved copy keeps JPEG and WebP, and is PNG otherwise', () => {
    expect(copyFile('https://x.com/photos/IMG_0001.JPEG?w=800')).toEqual({ name: 'IMG_0001-rotated.jpg', type: 'image/jpeg' });
    expect(copyFile('https://x.com/a/cat.webp')).toEqual({ name: 'cat-rotated.webp', type: 'image/webp' });
    expect(copyFile('https://x.com/a/icon.gif')).toEqual({ name: 'icon-rotated.png', type: 'image/png' });
    expect(copyFile('https://x.com/')).toEqual({ name: 'image-rotated.png', type: 'image/png' });
    expect(copyFile('data:image/jpeg;base64,AAAA')).toEqual({ name: 'image-rotated.jpg', type: 'image/jpeg' });
  });

  test('the title is the file name; data: URLs and junk have none', () => {
    expect(mediaName('https://x.com/photos/a%20b.jpg?w=800')).toBe('a b.jpg');
    expect(mediaName('data:image/png;base64,AAAA')).toBe('');
    expect(mediaName('not a url')).toBe('');
    expect(mediaName('https://x.com/%E0%A4%A')).toBe('');
  });
});
