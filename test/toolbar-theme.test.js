/**
 * How Upright wires the light/dark toolbar glyph. The theme itself (reports, the offscreen
 * watcher) is tested in @arraypress/extension-kit; test/e2e/toolbar.mjs runs it in Chromium.
 *
 * @module test/toolbar-theme
 */
import { expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fakeChromeStorage } from '@arraypress/extension-kit/testing';
import { OFFSCREEN_PATH, TOOLBAR_DARK_KEY, toolbarIcon } from '../extension/vendor/extension-kit/index.js';
import { DEFAULTS, settingsStore } from '../extension/shared/settings.js';

const root = new URL('../extension/', import.meta.url);
/** @param {string} file */
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('manifest starts on the light glyph, keeps its brand icons, asks for offscreen; every glyph exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  /** @param {Record<string, string>} icon */
  const fromRoot = (icon) => Object.fromEntries(Object.entries(icon).map(([size, file]) => [size, file.slice(1)]));
  expect(manifest.action.default_icon).toEqual(fromRoot(toolbarIcon(false)));
  expect(manifest.icons['128']).toBe('icons/icon-128.png');
  expect(manifest.permissions).toContain('offscreen');
  for (const file of [...Object.values(toolbarIcon(false)), ...Object.values(toolbarIcon(true))]) {
    expect(existsSync(new URL(file.slice(1), root)), file).toBe(true);
  }
  expect(existsSync(new URL(OFFSCREEN_PATH, root))).toBe(true);
});

test('the worker starts the theme, the offscreen document watches, both pages report', () => {
  expect(read('background/background.js')).toMatch(/startToolbarTheme\(chrome\)/);
  expect(read('offscreen/offscreen.js')).toMatch(/watchSchemeOffscreen\(chrome\.runtime\)/);
  for (const page of ['options/options.js', 'viewer/viewer.js']) expect(read(page), page).toMatch(/watchColorScheme\(chrome\)/);
  // The toolbar button opens settings, as there's no popup.
  expect(read('background/background.js')).toMatch(/action\.onClicked\.addListener\(\(\) => chrome\.runtime\.openOptionsPage\(\)\)/);
});

test('toolbarDark: this computer’s, never synced (saving and loading leave it in local)', async () => {
  expect([...settingsStore.localKeys, ...settingsStore.syncedKeys]).not.toContain(TOOLBAR_DARK_KEY);
  const storage = fakeChromeStorage({ local: { [TOOLBAR_DARK_KEY]: true, singleKey: true } });
  await settingsStore.save(storage, { singleDirection: 'left' });
  expect(TOOLBAR_DARK_KEY in storage.sync.data).toBe(false);
  expect(storage.local.data[TOOLBAR_DARK_KEY]).toBe(true);
  expect(await settingsStore.load(storage)).toEqual({ ...DEFAULTS, singleKey: true, singleDirection: 'left' });
});
