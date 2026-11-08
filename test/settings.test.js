import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULTS, LOCAL_KEYS, SYNCED_KEYS, UNSYNCED, changedSettings, loadSettings, retryUnsynced, saveSettings, settingsSaver,
} from '../extension/shared/settings.js';
import { OLD_SWITCH, OLD_SYNC_ITEM, moveSettingsToSync } from '../extension/background/migrate.js';
import { fakeChromeStorage } from './fake-storage.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** A clock the fake's sync write limit reads; tests move it on. */
const clock = () => {
  let t = 1_000_000;
  return { now: () => t, pass: (ms) => { t += ms; } };
};
/** Use up the minute's sync writes. */
const exhaust = async (storage) => {
  for (let i = 0; i < 120; i++) await storage.sync.set({ filler: i });
};
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

/** Single-key mode on, for chosen sites, as a computer with site access would have it. */
const SINGLE_KEY = { singleKey: true, singleKeyScope: 'chosen', singleKeySites: ['https://a.com'] };

describe('settings storage', () => {
  test('single-key mode, its scope and its sites are this computer’s; everything else syncs', () => {
    expect(LOCAL_KEYS).toEqual(['singleKey', 'singleKeyScope', 'singleKeySites']);
    expect(SYNCED_KEYS).toEqual(['menuStyle', 'singleDirection', 'extraKeys', 'neverSites']);
  });

  test('empty storage gives defaults', async () => {
    expect(await loadSettings(fakeChromeStorage())).toEqual(DEFAULTS);
  });

  test('saving: synced settings go to Chrome Sync, one item each; single-key mode to local only', async () => {
    const storage = fakeChromeStorage();
    const { settings, synced } = await saveSettings(storage, {
      menuStyle: 'full', neverSites: ['https://www.YouTube.com/watch'], ...SINGLE_KEY,
    });
    expect(synced).toBe(true);
    expect(settings).toEqual({ ...DEFAULTS, menuStyle: 'full', neverSites: ['youtube.com'], ...SINGLE_KEY });
    expect(storage.sync.data).toEqual({ menuStyle: 'full', neverSites: ['youtube.com'] });
    expect(storage.local.data).toEqual(SINGLE_KEY);
    expect(await loadSettings(storage)).toEqual(settings);
  });

  test('changing only single-key mode writes nothing to sync', async () => {
    const storage = fakeChromeStorage();
    await saveSettings(storage, { singleKey: true });
    expect(storage.sync.writes).toBe(0);
  });

  test('single-key mode found in sync (another version put it there) is never used', async () => {
    const storage = fakeChromeStorage({ sync: { singleKey: true, singleKeySites: ['https://evil.example'] } });
    expect(await loadSettings(storage)).toEqual(DEFAULTS);
  });

  test('only what changed is written, so another computer’s change meanwhile survives', async () => {
    const storage = fakeChromeStorage();
    await storage.sync.set({ extraKeys: true }); // From another computer, while the page was open.
    await saveSettings(storage, { menuStyle: 'full' });
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, extraKeys: true, menuStyle: 'full' });
  });

  test('a change from another computer, or one held for sync, counts as a settings change', () => {
    expect(changedSettings({ menuStyle: { newValue: 'full' }, filler: {} }, 'sync')).toEqual(['menuStyle']);
    expect(changedSettings({ singleKey: { newValue: true } }, 'sync')).toEqual([]);
    expect(changedSettings({ singleKey: { newValue: true } }, 'local')).toEqual(['singleKey']);
    expect(changedSettings({ [UNSYNCED]: { oldValue: { extraKeys: true } } }, 'local')).toEqual(['extraKeys']);
    expect(changedSettings({ menuStyle: { newValue: 'full' } }, 'session')).toEqual([]);
  });

  test('sync refuses (too many writes a minute): kept here and still read, then retried', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    expect((await saveSettings(storage, { extraKeys: true, ...SINGLE_KEY })).synced).toBe(false);
    expect(storage.local.data[UNSYNCED]).toEqual({ extraKeys: true });
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, extraKeys: true, ...SINGLE_KEY });

    time.pass(61_000);
    expect(await retryUnsynced(storage)).toBe(true);
    expect(storage.sync.data.extraKeys).toBe(true);
    expect(storage.local.data).toEqual(SINGLE_KEY);
  });

  test('a “Never on” list too big for one sync item stays on this computer; the rest still syncs', async () => {
    const warn = quiet();
    const error = vi.spyOn(console, 'error');
    const storage = fakeChromeStorage();
    const neverSites = Array.from({ length: 500 }, (_, i) => `site-number-${i}.example.com`);
    expect((await saveSettings(storage, { neverSites, menuStyle: 'full' })).synced).toBe(false);
    expect(storage.sync.data).toEqual({ menuStyle: 'full' });
    expect((await loadSettings(storage)).neverSites).toHaveLength(500);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled(); // Known too big: not even tried.
  });
});

describe('options page saver', () => {
  test('a burst of clicks is one sync write, of the last state', async () => {
    const storage = fakeChromeStorage();
    const onSaved = vi.fn();
    const saver = settingsSaver(storage, { delay: 20, onSaved });
    for (let i = 0; i < 150; i++) saver.save({ menuStyle: i % 2 ? 'full' : 'single', extraKeys: i % 3 === 0 });
    expect(saver.pending).toEqual({ menuStyle: 'full', extraKeys: false });
    expect(storage.sync.writes).toBe(0);
    await wait(60);
    await saver.flush();
    expect(storage.sync.writes).toBe(1);
    expect(storage.sync.data).toEqual({ menuStyle: 'full', extraKeys: false });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  test('without it, the same burst runs into sync’s write limit', async () => {
    quiet();
    const storage = fakeChromeStorage();
    const results = [];
    for (let i = 0; i < 150; i++) results.push((await saveSettings(storage, { menuStyle: i % 2 ? 'full' : 'single' })).synced);
    expect(results).toContain(false);
  });

  test('flush() writes at once (the page is closing)', async () => {
    const storage = fakeChromeStorage();
    const saver = settingsSaver(storage, { delay: 10_000 });
    saver.save({ singleDirection: 'left', singleKey: true });
    await saver.flush();
    expect(storage.sync.data).toEqual({ singleDirection: 'left' });
    expect(storage.local.data).toEqual({ singleKey: true });
    saver.stop();
  });

  test('a refused write is kept here and retried until sync takes it', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ now: time.now });
    await exhaust(storage);
    const saver = settingsSaver(storage, { delay: 5, retryAfter: 20 });
    try {
      saver.save({ neverSites: ['youtube.com'] });
      await saver.flush();
      await wait(50);
      expect(storage.local.data[UNSYNCED]).toEqual({ neverSites: ['youtube.com'] });
      time.pass(61_000);
      await wait(50);
      expect(storage.sync.data.neverSites).toEqual(['youtube.com']);
      expect(UNSYNCED in storage.local.data).toBe(false);
    } finally {
      saver.stop();
    }
  });
});

describe('moving settings to sync (installs from before it was always on)', () => {
  /** What the last build saved in local: every setting, normalised, plus the opt-in switch. */
  const lastBuild = (changes, switchOn = false) => ({ ...DEFAULTS, ...changes, [OLD_SWITCH]: switchOn });

  test('local only: synced settings move to sync; single-key mode stays in local', async () => {
    const mine = { menuStyle: 'full', extraKeys: true, neverSites: ['youtube.com'], ...SINGLE_KEY };
    const storage = fakeChromeStorage({ local: lastBuild(mine) });
    await moveSettingsToSync(storage);
    expect(storage.sync.data).toEqual({ menuStyle: 'full', singleDirection: 'right', extraKeys: true, neverSites: ['youtube.com'] });
    expect(storage.local.data).toEqual(SINGLE_KEY);
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, ...mine });
  });

  test('sync already holds settings (another computer): sync wins, except single-key mode', async () => {
    const theirs = { menuStyle: 'full', singleDirection: 'left', extraKeys: true, neverSites: ['example.com'] };
    const storage = fakeChromeStorage({ local: lastBuild({ menuStyle: 'single', ...SINGLE_KEY }), sync: theirs });
    await moveSettingsToSync(storage);
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, ...theirs, ...SINGLE_KEY });
    expect(storage.sync.data).toEqual(theirs);
  });

  test('the old switch’s mirrored item is taken as sync’s, never its single-key mode, then removed', async () => {
    // 'sideways' is unreadable (junk, or a newer version's): this computer's own direction stays.
    const mirrored = { menuStyle: 'full', singleDirection: 'sideways', extraKeys: true, neverSites: [], singleKey: true };
    const storage = fakeChromeStorage({ local: lastBuild({ singleDirection: 'left' }, true), sync: { [OLD_SYNC_ITEM]: mirrored } });
    await moveSettingsToSync(storage);
    expect(storage.sync.data).toEqual({ menuStyle: 'full', singleDirection: 'left', extraKeys: true, neverSites: [] });
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, menuStyle: 'full', singleDirection: 'left', extraKeys: true });
    expect(storage.local.data).toEqual({ singleKey: false, singleKeyScope: 'all', singleKeySites: [] });
  });

  test('running it twice changes nothing more and writes nothing', async () => {
    const storage = fakeChromeStorage({ local: lastBuild({ menuStyle: 'full', ...SINGLE_KEY }, true) });
    await moveSettingsToSync(storage);
    const after = structuredClone({ sync: storage.sync.data, local: storage.local.data });
    const writes = storage.sync.writes;
    await moveSettingsToSync(storage);
    expect({ sync: storage.sync.data, local: storage.local.data }).toEqual(after);
    expect(storage.sync.writes).toBe(writes);
  });

  test('sync refuses the move: nothing is lost, and the next run finishes it', async () => {
    quiet();
    const time = clock();
    const storage = fakeChromeStorage({ local: lastBuild({ menuStyle: 'full', ...SINGLE_KEY }), now: time.now });
    await exhaust(storage);
    await moveSettingsToSync(storage);
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, menuStyle: 'full', ...SINGLE_KEY });

    time.pass(61_000);
    await moveSettingsToSync(storage);
    expect(storage.sync.data.menuStyle).toBe('full');
    expect(storage.local.data).toEqual(SINGLE_KEY);
    expect(await loadSettings(storage)).toEqual({ ...DEFAULTS, menuStyle: 'full', ...SINGLE_KEY });
  });
});
