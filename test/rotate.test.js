/**
 * Turning media in a page (extension/shared/rotate.js, shared/page.js) against a fake of
 * `chrome.scripting` that keeps one element's turn as the page would (the edge). What runs in the
 * page is checked in real Chromium (test/e2e/rotate.mjs); here only that a key over nothing
 * doesn't walk the page, with a document that records what it's asked.
 *
 * @module test/rotate
 */
import { describe, expect, test, vi } from 'vitest';
import { findMedia } from '../extension/shared/page.js';
import { rotateInPage } from '../extension/shared/rotate.js';

/** @import { State } from '../extension/shared/transform.js' */

/**
 * `chrome.scripting.executeScript` for a tab holding one image: `findMedia` measures it (a moment
 * later, as a round trip to the page takes), `applyPlacement` keeps its new state.
 */
function tabWithImage() {
  /** @type {State | null} */
  let state = null;
  const scripting = {
    executeScript: async (/** @type {{ func: Function, args: unknown[] }} */ { func, args }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (func === findMedia) {
        return [{ frameId: 0, result: [{ kind: 'img', src: 'https://example.com/a.jpg', width: 400, height: 300, origin: [200, 150], transform: 'none', page: { translate: 'none', rotate: 'none', scale: 'none' }, state }] }];
      }
      state = /** @type {{ state: State }[]} */ (args[0])[0].state;
      return [{ frameId: 0, result: undefined }];
    },
  };
  return { scripting: /** @type {any} */ (scripting), state: () => state };
}

describe('turning media in a page', () => {
  test('two turns in quick succession (a shortcut pressed twice) build up: each starts from where the last left it', async () => {
    const tab = tabWithImage();
    const turns = await Promise.all([
      rotateInPage(tab.scripting, { tabId: 7, srcUrl: null, action: 'rotate-right' }),
      rotateInPage(tab.scripting, { tabId: 7, srcUrl: null, action: 'rotate-right' }),
      rotateInPage(tab.scripting, { tabId: 7, srcUrl: null, action: 'rotate-right' }),
    ]);
    expect(turns.map((turn) => turn.state.r)).toEqual([90, 180, 270]);
    expect(tab.state()?.r).toBe(270);
  });

  test('a page Chrome won’t script fails that turn only: the next one in the tab still runs', async () => {
    const tab = tabWithImage();
    const broken = { executeScript: async () => { throw new Error('Cannot access contents of the page'); } };
    await expect(rotateInPage(/** @type {any} */ (broken), { tabId: 7, srcUrl: null, action: 'rotate-right' })).rejects.toThrow('Cannot access');
    expect((await rotateInPage(tab.scripting, { tabId: 7, srcUrl: null, action: 'rotate-left' })).state.r).toBe(270);
  });
});

describe('finding the media under the pointer', () => {
  test('with nothing under the pointer, the page isn’t walked for media at all', () => {
    /** @type {string[]} */
    const asked = [];
    vi.stubGlobal('document', { querySelectorAll: (/** @type {string} */ selector) => { asked.push(selector); return []; } });
    try {
      expect(findMedia(null)).toEqual([]);
      expect(asked).toEqual([':hover']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
