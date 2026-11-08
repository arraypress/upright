// Upright's own settings: which are this computer's and how the store keeps them. The store's
// general behaviour (refused writes, the debounced saver) is tested in @arraypress/extension-kit.
import { describe, expect, test } from 'vitest';
import { fakeChromeStorage } from '@arraypress/extension-kit/testing';
import { DEFAULTS, settingsStore } from '../extension/shared/settings.js';

/** Single-key mode on, for chosen sites, as a computer with site access would have it. */
const SINGLE_KEY = { singleKey: true, singleKeyScope: /** @type {const} */ ('chosen'), singleKeySites: ['https://a.com'] };

describe('settings storage', () => {
  test('single-key mode, its scope and its sites are this computer’s; everything else syncs', () => {
    expect(settingsStore.localKeys).toEqual(['singleKey', 'singleKeyScope', 'singleKeySites']);
    expect(settingsStore.syncedKeys).toEqual(['menuStyle', 'singleDirection', 'extraKeys', 'neverSites']);
  });

  test('empty storage gives defaults', async () => {
    expect(await settingsStore.load(fakeChromeStorage())).toEqual(DEFAULTS);
  });

  test('saving: synced settings go to Chrome Sync, one item each; single-key mode to local only', async () => {
    const storage = fakeChromeStorage();
    const { settings, synced } = await settingsStore.save(storage, {
      menuStyle: 'full', neverSites: ['https://www.YouTube.com/watch'], ...SINGLE_KEY,
    });
    expect(synced).toBe(true);
    expect(settings).toEqual({ ...DEFAULTS, menuStyle: 'full', neverSites: ['youtube.com'], ...SINGLE_KEY });
    expect(storage.sync.data).toEqual({ menuStyle: 'full', neverSites: ['youtube.com'] });
    expect(storage.local.data).toEqual(SINGLE_KEY);
    expect(await settingsStore.load(storage)).toEqual(settings);
  });

  test('single-key mode found in sync (another version put it there) is never used', async () => {
    const storage = fakeChromeStorage({ sync: { singleKey: true, singleKeySites: ['https://evil.example'] } });
    expect(await settingsStore.load(storage)).toEqual(DEFAULTS);
  });

  test('a change from another computer, or one held for sync, counts as a settings change', () => {
    expect(settingsStore.changed({ menuStyle: { newValue: 'full' }, filler: {} }, 'sync')).toEqual(['menuStyle']);
    expect(settingsStore.changed({ singleKey: { newValue: true } }, 'local')).toEqual(['singleKey']);
    expect(settingsStore.changed({ [settingsStore.unsyncedKey]: { oldValue: { extraKeys: true } } }, 'local')).toEqual(['extraKeys']);
  });

  test('a “Never on” list too big for one sync item stays on this computer; the rest still syncs', async () => {
    const storage = fakeChromeStorage();
    const neverSites = Array.from({ length: 500 }, (_, i) => `site-number-${i}.example.com`);
    expect((await settingsStore.save(storage, { neverSites, menuStyle: 'full' })).synced).toBe(false);
    expect(storage.sync.data).toEqual({ menuStyle: 'full' });
    expect((await settingsStore.load(storage)).neverSites).toHaveLength(500);
  });
});
