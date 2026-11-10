/**
 * End-to-end: loads the e2e build into Playwright's Chromium, serves a real page (an image,
 * a <picture>, a video, images the page already transforms, BBC News's own markup,
 * duplicates, an overlay, frames) and calls the handlers a menu click and a shortcut call
 * (Chrome's native menu and shortcuts can't be driven headlessly; see scripts/build-e2e.mjs).
 * Then checks what the page draws, that its layout didn't move, the viewer, the menu
 * settings and single-key mode.
 *
 * Only the network edge is faked: ichef.bbci.co.uk is answered locally.
 * Run with `npm run test:e2e`. Needs Playwright's Chromium: `npx playwright install chromium`.
 * ROTATE_SHOTS=dir also saves screenshots there.
 *
 * @module test/e2e/rotate
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkRunner, launchExtension, testBuildDir, until } from '@arraypress/extension-kit/testing';
import { settingsStore } from '../../extension/shared/settings.js';
import { ABOUT_LINKS } from '../../extension/options/about-links.js';
import { listenLocally } from '../../scripts/local-server.mjs';
import { testHook } from './hook-client.mjs';

/** @import { Frame, Page } from 'playwright' */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(path.dirname(here));
const extensionPath = testBuildDir(root);
const shots = process.env.ROTATE_SHOTS;
/**
 * @param {string} name - A file in fixtures/.
 * @returns {Promise<Buffer>} Its bytes.
 */
const fixture = (name) => readFile(path.join(here, 'fixtures', name));
const BBC = (await fixture('bbc-figure.html')).toString();
// The webp the BBC <source> picks at this window size, and the size variant the user
// right-clicked on another BBC page (same image, /news/1536/ path).
const BBC_SHOWN = 'https://ichef.bbci.co.uk/ace/standard/800/cpsprodpb/abf1/live/2a307ee0-daf5-11f1-827e-c7e7ee102257.jpg.webp';
const BBC_VARIANT = 'https://ichef.bbci.co.uk/news/1536/cpsprodpb/abf1/live/2a307ee0-daf5-11f1-827e-c7e7ee102257.jpg.webp';

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Upright test page</title>
<style>
  body { margin: 0; padding: 12px; font: 12px/1.4 system-ui, sans-serif; background: #fafafa; }
  .grid { display: grid; grid-template-columns: repeat(5, 240px); gap: 12px; align-items: start; }
  figure { margin: 0; padding: 8px; border: 1px dashed #aaa; background: #fff; }
  figcaption { color: #555; margin-top: 4px; }
  img, video { display: block; }
  /* The page's own transform, with an origin that isn't the centre. */
  #tilted { transform: rotate(-6deg) translateX(10px); transform-origin: top left; }
  /* Centred the way Tailwind v4 does it: the individual translate property. */
  .centred { position: relative; height: 140px; }
  .centred img { position: absolute; left: 50%; top: 50%; translate: -50% -50%; }
  /* A gallery: a link layer over the photo, as Instagram does. */
  .gallery { position: relative; }
  .gallery .overlay { position: absolute; inset: 8px; }
  /* Just enough of BBC News's CSS for its markup to lay out. */
  .bbc img { width: 100%; height: auto; }
  .bbc .visually-hidden { position: absolute; clip-path: inset(50%); width: 1px; height: 1px; overflow: hidden; }
  iframe { width: 240px; height: 150px; border: 1px dashed #aaa; }
</style>
<div class="grid">
  <figure><img id="plain" src="/media/photo.png" width="224" height="140" alt=""><figcaption>img</figcaption></figure>
  <figure><picture><source srcset="/media/photo-wide.png 1x, /media/photo-wide.png?at=2 2x"><img id="pic" src="/media/photo.png" width="224" height="124" alt=""></picture><figcaption>picture</figcaption></figure>
  <figure><video id="vid" width="224" height="126" controls muted loop><source src="/media/clip.webm" type="video/webm"></video><figcaption>video</figcaption></figure>
  <figure><img id="tilted" src="/media/photo.png?tilted" width="200" height="125" alt=""><figcaption>page transform</figcaption></figure>
  <figure class="centred"><img id="centred" src="/media/photo.png?centred" width="160" height="100" alt=""></figure>
  <div class="bbc" id="bbc">BBC</div>
  <figure class="gallery"><img id="under" src="/media/photo.png?under" width="224" height="140" alt=""><a class="overlay" id="overlay" href="#"></a></figure>
  <figure><img id="dup-on" src="/media/photo.png?dup" width="160" height="100" alt=""><figcaption>duplicate (on screen)</figcaption></figure>
  <figure><img id="hover-a" src="/media/photo.png?hover" width="100" height="62" alt=""><img id="hover-b" src="/media/photo.png?hover" width="100" height="62" alt=""></figure>
  <figure><img id="remote" src="CROSS/media/photo.png?remote" width="160" height="100" alt=""><figcaption>other site</figcaption></figure>
  <figure><img id="cors" src="CROSS/cors/photo.png" width="160" height="100" alt=""><figcaption>other site, CORS</figcaption></figure>
  <figure><input id="field" placeholder="type here"></figure>
  <iframe id="same" src="/frame"></iframe>
  <iframe id="cross" src="CROSS/frame"></iframe>
</div>
<div style="height: 2000px"></div>
<img id="dup-off" src="/media/photo.png?dup" width="160" height="100" alt="">
<script>
  // The page's own shortcut handler, to prove keys we don't use still reach it.
  window.pageKeys = [];
  document.addEventListener('keydown', (event) => window.pageKeys.push(event.key));
</script>`.replace('BBC</div>', `${BBC}</div>`);

const FRAME = `<!doctype html><style>body{margin:0}img{display:block}</style>
<img id="framed" src="/media/photo.png?framed" width="200" height="125" alt="">`;

/** @type {Readonly<Record<string, string>>} */
const TYPES = { '.png': 'image/png', '.webm': 'video/webm' };

const { server, origin } = await listenLocally(async (pathname, res) => {
  // localhost is the same server, but another site: the e2e build has no access to it.
  if (pathname === '/') return res.end(PAGE.replaceAll('CROSS', `http://localhost:${new URL(origin).port}`));
  if (pathname === '/frame') return res.end(FRAME);
  const media = /^\/(media|cors)\/([\w-]+\.\w+)$/.exec(pathname);
  if (!media) return res.writeHead(404).end();
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': TYPES[path.extname(media[2])] };
  if (media[1] === 'cors') headers['Access-Control-Allow-Origin'] = '*';
  res.writeHead(200, headers).end(await fixture(media[2]));
});
if (shots) await mkdir(shots, { recursive: true });

const launched = await launchExtension(chromium, extensionPath, { prefix: 'upright-e2e-', viewport: { width: 1320, height: 860 } });
const { context } = launched;
// The network edge: BBC's image CDN, answered with a local picture.
const bbcImage = await fixture('photo-wide.png');
await context.route('https://ichef.bbci.co.uk/**', (route) => route.fulfill({ contentType: 'image/png', body: bbcImage }));

const { check, finish } = checkRunner();

/** @param {number} ms @returns {Promise<void>} Resolves after `ms`. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Assert two numbers are within `tolerance` of each other.
 *
 * @param {number} actual - Measured.
 * @param {number} expected - Wanted.
 * @param {string} what - For the failure message.
 * @param {number} [tolerance] - Default 1 (px).
 */
const near = (actual, expected, what, tolerance = 1) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not ≈ ${expected}`);

try {
  const { worker, extensionId } = launched;
  console.log(`Extension ${extensionId} loaded; site ${origin}\n`);

  const page = await context.newPage();
  /** @type {string[]} Errors the test page threw; checked last. */
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  /** @type {[number, number]} Over nothing in particular. */
  const PARKED = [1310, 850];
  /** Move the pointer off everything. */
  const park = () => page.mouse.move(...PARKED);
  const load = async () => {
    await page.goto(`${origin}/`);
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
    await page.waitForFunction(() => /** @type {HTMLVideoElement} */ (document.getElementById('vid')).readyState >= 2);
    await park();
  };
  await load();

  /**
   * @param {string} id - An <img> or <video>'s id.
   * @param {Page | Frame} [frame] - Where it is. Default the test page.
   * @returns {Promise<string>} What it shows.
   */
  const srcOf = (id, frame = page) =>
    frame.evaluate((id) => /** @type {HTMLImageElement | HTMLVideoElement} */ (document.getElementById(id)).currentSrc, id);
  const pageTab = () => worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0], `${origin}/`);
  const tabCount = () => worker.evaluate(async () => (await chrome.tabs.query({})).length);
  const hook = testHook(worker);

  /**
   * Call what the menu calls, as Chrome would for a click on `srcUrl` in frame `frameId`.
   *
   * @param {string} menuItemId - The item.
   * @param {string} srcUrl - The right-clicked media's URL.
   * @param {object} [where] - Where it was clicked.
   * @param {number} [where.frameId] - Default the top frame.
   * @param {'image' | 'video'} [where.mediaType] - Default image.
   * @param {chrome.tabs.Tab} [where.tab] - Default the tab showing `pageUrl`.
   * @param {string} [where.pageUrl] - Default the test page.
   */
  const click = async (menuItemId, srcUrl, { frameId = 0, mediaType = 'image', tab, pageUrl = `${origin}/` } = {}) => {
    await hook.click({ menuItemId, srcUrl, frameId, mediaType, pageUrl }, tab);
  };
  /**
   * Call what a keyboard shortcut calls.
   *
   * @param {string} name - The command.
   * @param {chrome.tabs.Tab} [tab] - Default the test page's tab.
   */
  const command = async (name, tab) => {
    await hook.command(name, tab ?? await pageTab());
  };
  /**
   * Settings as the options page stores them: per-computer ones in local, the rest in sync.
   *
   * @param {Record<string, unknown>} changes - Raw values.
   */
  const setSettings = (changes) => worker.evaluate(([changes, localKeys]) => {
    /** @type {[Record<string, unknown>, Record<string, unknown>]} */
    const [local, synced] = [{}, {}];
    for (const [key, value] of Object.entries(changes)) (localKeys.includes(key) ? local : synced)[key] = value;
    return Promise.all([chrome.storage.local.set(local), chrome.storage.sync.set(synced)]);
  }, /** @type {const} */ ([changes, /** @type {readonly string[]} */ (settingsStore.localKeys)]));
  const stored = () => worker.evaluate(async () => ({ sync: await chrome.storage.sync.get(null), local: await chrome.storage.local.get(null) }));
  /**
   * Whether a menu item id exists right now (updating a missing one fails).
   *
   * @param {string} id - The item's id.
   * @returns {Promise<boolean>}
   */
  const menuHas = (id) => worker.evaluate(
    (id) => chrome.contextMenus.update(id, /** @type {Omit<chrome.contextMenus.CreateProperties, 'id'>} */ ({})).then(() => true, () => false),
    id,
  );

  /**
   * Computed individual transforms, the page's own transform, and the state attribute.
   *
   * @param {string} id - The element's id.
   * @param {Page | Frame} [frame] - Where it is. Default the test page.
   */
  const drawn = (id, frame = page) => frame.evaluate((id) => {
    const el = /** @type {HTMLElement} */ (document.getElementById(id));
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      rotate: style.rotate, scale: style.scale, translate: style.translate, transform: style.transform,
      state: el.getAttribute('data-rotate-image'), style: el.getAttribute('style'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 },
      box: { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight },
    };
  }, id);

  /**
   * Move the pointer to the centre of an element in the test page.
   *
   * @param {string} id - The element's id.
   */
  const hover = async (id) => {
    const { rect } = await drawn(id);
    await page.mouse.move(rect.cx, rect.cy);
  };

  /** Every element's layout box, and the page's scroll size: what must not move. */
  const layout = () => page.evaluate(() => ({
    boxes: [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('figure, img, video, iframe, figcaption'))]
      .map((el) => [el.id || el.localName, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight]),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  }));

  const before = await layout();
  const start = Object.fromEntries(await Promise.all(
    ['plain', 'pic', 'vid', 'tilted', 'centred', 'under'].map(async (id) => [id, await drawn(id)])));
  if (shots) await page.screenshot({ path: path.join(shots, 'page-before.png') });

  // --- The menu, as set in options ---

  await check('by default the menu is one item; it turns a quarter per click (twice is 180°)', async () => {
    assert.equal(await menuHas('rotate-image'), true);
    assert.equal(await menuHas('rotate-video'), true);
    assert.equal(await menuHas('rotate'), false, 'no submenu');
    await click('rotate-image', await srcOf('plain'));
    assert.equal((await drawn('plain')).rotate, '90deg');
    await click('rotate-image', await srcOf('plain'));
    const d = await drawn('plain');
    assert.equal(d.rotate, '180deg');
    assert.equal(d.scale, '1');
  });

  await check('"a click rotates counterclockwise" turns the one item the other way', async () => {
    await setSettings({ singleDirection: 'left' });
    await click('rotate-image', await srcOf('plain'));
    assert.equal((await drawn('plain')).rotate, '90deg', '180° − 90°');
    await click('rotate-image', await srcOf('plain'));
    assert.equal((await drawn('plain')).state, null, 'upright again');
    await setSettings({ singleDirection: 'right' });
  });

  await check('choosing "Full menu" rebuilds it as the Rotate submenu, with no duplicate ids', async () => {
    // Several quick changes in a row: the rebuilds are queued, so they can't interleave.
    await setSettings({ menuStyle: 'full' });
    await setSettings({ menuStyle: 'single' });
    await setSettings({ menuStyle: 'full' });
    await until(() => menuHas('rotate'), 'the submenu');
    await sleep(300);
    for (const id of ['rotate', 'rotate-right', 'rotate-left', 'rotate-180', 'flip-horizontal', 'flip-vertical', 'reset', 'open-in-new-tab']) {
      assert.equal(await menuHas(id), true, id);
    }
    assert.equal(await menuHas('rotate-image'), false, 'the one item is gone');
  });

  // --- Turning in place (full menu from here) ---

  await check('img: rotate clockwise turns it 90° and shrinks it to fit its own box, centred; nothing else turns', async () => {
    await click('rotate-right', await srcOf('plain'));
    const d = await drawn('plain');
    assert.equal(d.rotate, '90deg');
    assert.equal(d.scale, '0.625'); // 140 / 224
    near(d.rect.width, 140 * 0.625, 'drawn width');
    near(d.rect.height, 140, 'drawn height');
    near(d.rect.cx, start.plain.rect.cx, 'centre x');
    near(d.rect.cy, start.plain.rect.cy, 'centre y');
    assert.deepEqual(d.box, start.plain.box);
    // The <picture> falls back to the same photo.png, but shows another file: it stays.
    assert.equal((await drawn('pic')).rotate, 'none');
  });

  await check('img: turns accumulate (clockwise twice is 180°) and a flip combines with them', async () => {
    await click('rotate-right', await srcOf('plain'));
    let d = await drawn('plain');
    assert.equal(d.rotate, '180deg');
    assert.equal(d.scale, '1');
    await click('flip-horizontal', await srcOf('plain'));
    d = await drawn('plain');
    assert.equal(d.scale, '-1 1');
    const state = JSON.parse(d.state ?? 'null');
    assert.deepEqual([state.r, state.f], [180, true], 'the state attribute');
    await click('flip-horizontal', await srcOf('plain'));
    await click('rotate-left', await srcOf('plain'));
    assert.equal((await drawn('plain')).rotate, '90deg');
  });

  await check('picture: matched by the <source> it shows; counterclockwise is 270°', async () => {
    const src = await srcOf('pic');
    assert.match(src, /photo-wide\.png$/, 'the <source> is what shows');
    await click('rotate-left', src);
    const d = await drawn('pic');
    assert.equal(d.rotate, '270deg');
    near(d.rect.height, 124, 'fits the height');
    near(d.rect.cx, start.pic.rect.cx, 'centre x');
  });

  const bbcRotate = () => page.$eval('#bbc img', (img) => getComputedStyle(img).rotate);

  await check('BBC News markup: a <picture> with webp srcset turns in place', async () => {
    const src = await page.$eval('#bbc img', (img) => /** @type {HTMLImageElement} */ (img).currentSrc);
    assert.equal(src, BBC_SHOWN);
    await click('rotate-right', src);
    assert.equal(await bbcRotate(), '90deg');
  });

  await check('BBC News: the same image in another size and path (/news/1536/…) is found too', async () => {
    await click('rotate-right', BBC_VARIANT);
    assert.equal(await bbcRotate(), '180deg');
  });

  await check('video: matched by its <source>, turned, and still takes clicks where it\'s drawn', async () => {
    await click('rotate-right', await srcOf('vid'), { mediaType: 'video' });
    const d = await drawn('vid');
    assert.equal(d.rotate, '90deg');
    assert.equal(d.scale, '0.5625'); // 126 / 224
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [d.rect.cx, d.rect.y + 20]);
    assert.equal(hit, 'vid', 'hit-testing follows the turn');
    // The play button sits bottom-left; a quarter turn clockwise puts it at the top.
    // Clicking it where it's drawn now must still play. (Chrome's controls swallow the
    // pointer events, so the playback state is what shows the click landed.)
    const paused = () => page.evaluate(() => /** @type {HTMLVideoElement} */ (document.getElementById('vid')).paused);
    assert.equal(await paused(), true);
    await page.mouse.click(d.rect.cx, d.rect.y + 15);
    await until(async () => !(await paused()), 'the turned play button to play the video');
    await park();
  });

  await check('a page transform (rotate + translate, top-left origin) is kept, and the box stays put', async () => {
    await click('rotate-right', await srcOf('tilted'));
    const d = await drawn('tilted');
    assert.equal(d.transform, start.tilted.transform, 'the page\'s transform is untouched');
    near(d.rect.cx, start.tilted.rect.cx, 'centre x');
    near(d.rect.cy, start.tilted.rect.cy, 'centre y');
    assert.ok(d.rect.width <= start.tilted.rect.width + 1 && d.rect.height <= start.tilted.rect.height + 1, 'no bigger than before');
  });

  await check('a stylesheet `translate: -50% -50%` (Tailwind-style centring) keeps it centred', async () => {
    await click('rotate-180', await srcOf('centred'));
    await click('flip-vertical', await srcOf('centred'));
    const d = await drawn('centred');
    assert.equal(d.rotate, '0deg');
    assert.equal(d.scale, '-1 1', '180° then a vertical flip is a horizontal flip');
    assert.equal(d.translate, '-80px -50px');
    near(d.rect.cx, start.centred.rect.cx, 'centre x');
    near(d.rect.cy, start.centred.rect.cy, 'centre y');
  });

  await check('the layout doesn\'t move: every box and the scroll size are as before', async () => {
    assert.deepEqual(await layout(), before);
  });

  if (shots) await page.screenshot({ path: path.join(shots, 'page-after.png') });

  await check('of two copies, only the one on screen turns', async () => {
    await click('rotate-right', await srcOf('dup-on'));
    assert.equal((await drawn('dup-on')).rotate, '90deg');
    assert.equal((await drawn('dup-off')).rotate, 'none');
  });

  await check('of two copies on screen, the one under the pointer turns', async () => {
    await hover('hover-b');
    await click('rotate-180', await srcOf('hover-b'));
    assert.equal((await drawn('hover-b')).rotate, '180deg');
    assert.equal((await drawn('hover-a')).rotate, 'none');
    await park();
  });

  await check('Reset puts back exactly what the page had', async () => {
    for (const id of ['plain', 'tilted', 'centred']) {
      await click('reset', await srcOf(id));
      const d = await drawn(id);
      assert.equal(d.state, null, `${id}: state attribute`);
      assert.equal(d.style, null, `${id}: no style attribute left behind`);
      for (const key of /** @type {const} */ (['rotate', 'scale', 'translate', 'transform'])) assert.equal(d[key], start[id][key], `${id}: ${key}`);
    }
  });

  /**
   * The test page's frame whose URL passes `match`, as Chrome's menu would identify it.
   *
   * @param {(url: string) => boolean} match - Picks the frame.
   * @returns {Promise<chrome.webNavigation.GetAllFrameResultDetails>} The frame.
   */
  const chromeFrame = async (match) => {
    const frames = await worker.evaluate(async (pageUrl) => {
      const [tab] = await chrome.tabs.query({ url: pageUrl });
      return tab?.id === undefined ? null : chrome.webNavigation.getAllFrames({ tabId: tab.id });
    }, `${origin}/`);
    const found = frames?.find((f) => match(f.url));
    assert.ok(found, 'the frame is in the page');
    return found;
  };

  await check('a same-site frame: turned in place, in that frame', async () => {
    const { frameId } = await chromeFrame((url) => url === `${origin}/frame`);
    const frame = page.frames().find((f) => f.url() === `${origin}/frame`);
    assert.ok(frame, 'Playwright sees the frame');
    await click('rotate-right', await srcOf('framed', frame), { frameId });
    assert.equal((await drawn('framed', frame)).rotate, '90deg');
  });

  await check('nothing found, or a frame we can\'t reach: no tab opens', async () => {
    const tabs = await tabCount();
    await click('rotate-right', `${origin}/media/not-on-this-page.png`);
    const cross = await chromeFrame((url) => url.startsWith('http://localhost'));
    await click('rotate-left', `${new URL(cross.url).origin}/media/photo.png?framed`, { frameId: cross.frameId });
    await sleep(300);
    assert.equal(await tabCount(), tabs);
  });

  // --- Keyboard shortcuts (chrome.commands) ---

  await check('shortcut: turns the image under the pointer', async () => {
    await hover('hover-a');
    await command('rotate-right');
    assert.equal((await drawn('hover-a')).rotate, '90deg');
    await command('rotate-left');
    assert.equal((await drawn('hover-a')).state, null, 'back to upright');
    await park();
  });

  await check('shortcut: over an overlay (a gallery\'s link layer), the photo underneath turns', async () => {
    await hover('overlay');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(':hover')].at(-1)?.id), 'overlay');
    await command('rotate-right');
    assert.equal((await drawn('under')).rotate, '90deg');
    await command('reset');
    assert.equal((await drawn('under')).state, null);
    await park();
  });

  await check('shortcut: Alt+Shift+V opens the image under the pointer in one viewer tab, at its turn', async () => {
    await hover('hover-a');
    await command('rotate-right'); // Turned in the page first: the viewer starts there.
    const tabs = await tabCount();
    const opened = context.waitForEvent('page');
    await command('open-viewer');
    const viewer = await opened;
    await viewer.waitForLoadState();
    const url = new URL(viewer.url());
    assert.equal(url.pathname, '/viewer/viewer.html');
    assert.equal(url.searchParams.get('src'), await srcOf('hover-a'));
    assert.equal(url.searchParams.get('r'), '90');
    await sleep(200);
    assert.equal(await tabCount(), tabs + 1, 'exactly one tab');
    await viewer.close();
    await command('reset');
    await park();
  });

  await check('shortcut: with nothing under the pointer, nothing changes and no tab opens', async () => {
    const tabs = await tabCount();
    const turned = () => page.evaluate(() => [...document.querySelectorAll('[data-rotate-image]')].map((el) => el.id));
    const was = await turned();
    await command('open-viewer');
    await command('rotate-right');
    assert.deepEqual(await turned(), was);
    assert.equal(await tabCount(), tabs);
  });

  // --- The viewer ---

  /**
   * "Open in new tab" on a test page element, once the viewer has laid it out.
   *
   * @param {string} id - The element's id.
   * @param {'image' | 'video'} [mediaType] - Default image.
   * @returns {Promise<Page>} The viewer.
   */
  const openViewer = async (id, mediaType = 'image') => {
    const opened = context.waitForEvent('page');
    await click('open-in-new-tab', await srcOf(id), { mediaType });
    const viewer = await opened;
    await viewer.waitForLoadState();
    await viewer.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById('frame')).style.width);
    return viewer;
  };
  /**
   * What the viewer shows: its address's turn, zoom, transform, frame size and Save button.
   *
   * @param {Page} viewer - The viewer.
   */
  const viewerState = (viewer) => viewer.evaluate(() => {
    /** @type {(id: string) => HTMLElement} */
    const get = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
    const media = /** @type {HTMLElement} */ (document.querySelector('#frame > img, #frame > video'));
    const params = new URLSearchParams(location.search);
    return {
      r: params.get('r'), f: params.get('f'), zoom: get('zoom').textContent,
      transform: media.style.transform,
      frame: [parseFloat(get('frame').style.width), parseFloat(get('frame').style.height)],
      save: { disabled: /** @type {HTMLButtonElement} */ (get('save')).disabled, title: get('save-wrap').title },
    };
  });

  await check('viewer: opens at the page\'s current turn; R, Shift-R, H, V and 0 work', async () => {
    const viewer = await openViewer('pic'); // Turned to 270° above.
    let v = await viewerState(viewer);
    assert.equal(v.r, '270');
    assert.match(v.transform, /rotate\(270deg\) scaleX\(1\)/);
    assert.ok(v.frame[0] < v.frame[1], 'the frame is portrait: the wide picture on its side');
    await viewer.keyboard.press('r');
    assert.equal((await viewerState(viewer)).r, null, '270° + 90° is upright');
    await viewer.keyboard.press('Shift+R');
    assert.equal((await viewerState(viewer)).r, '270');
    await viewer.keyboard.press('h');
    v = await viewerState(viewer);
    assert.deepEqual([v.r, v.f], ['90', '1']);
    assert.match(v.transform, /scaleX\(-1\)/);
    await viewer.keyboard.press('v');
    v = await viewerState(viewer);
    assert.deepEqual([v.r, v.f], ['90', null], 'mirrored then flipped top to bottom is a plain quarter turn');
    await viewer.keyboard.press('0');
    v = await viewerState(viewer);
    assert.deepEqual([v.r, v.f], [null, null]);
    await viewer.close();
  });

  await check('viewer: the right-click menu and shortcuts turn the viewer itself, opening no tabs', async () => {
    const viewer = await openViewer('plain');
    const tab = await viewer.evaluate(() => chrome.tabs.getCurrent());
    const tabs = await tabCount();
    const src = await viewer.$eval('#frame > img', (img) => /** @type {HTMLImageElement} */ (img).currentSrc);
    await click('rotate-right', src, { tab, pageUrl: viewer.url() });
    await until(async () => (await viewerState(viewer)).r === '90', 'the viewer to turn');
    await click('flip-horizontal', src, { tab, pageUrl: viewer.url() });
    await until(async () => (await viewerState(viewer)).f === '1', 'the viewer to flip');
    // In one-item mode the item drives the viewer the same way.
    await setSettings({ menuStyle: 'single' });
    await click('rotate-image', src, { tab, pageUrl: viewer.url() });
    await until(async () => (await viewerState(viewer)).r !== '270', 'the one item to turn the viewer');
    await setSettings({ menuStyle: 'full' });
    // And a keyboard shortcut.
    await command('reset', tab);
    await until(async () => {
      const v = await viewerState(viewer);
      return v.r === null && v.f === null;
    }, 'the shortcut to reset the viewer');
    assert.equal(await tabCount(), tabs);
    await viewer.close();
  });

  await check('viewer: zoom steps and actual size', async () => {
    const viewer = await openViewer('hover-b'); // 320×200 at a turn of 180°.
    assert.equal((await viewerState(viewer)).zoom, '100%', 'a small image shows at actual size');
    await viewer.click('[data-action="zoom-in"]');
    assert.equal((await viewerState(viewer)).zoom, '110%');
    await viewer.keyboard.press('-');
    await viewer.keyboard.press('-');
    assert.equal((await viewerState(viewer)).zoom, '90%');
    await viewer.keyboard.press('1');
    const v = await viewerState(viewer);
    assert.equal(v.zoom, '100%');
    assert.deepEqual(v.frame, [320, 200], 'actual size is the image\'s own pixels');
    await viewer.close();
  });

  await check('viewer: Save is off with a reason when the site doesn\'t allow reading pixels', async () => {
    const viewer = await openViewer('remote');
    await viewer.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById('save-wrap')).title);
    const v = await viewerState(viewer);
    assert.equal(v.save.disabled, true);
    assert.match(v.save.title, /doesn’t let other pages read/);
    await viewer.close();
  });

  await check('viewer: with CORS, Save downloads the turned pixels', async () => {
    const viewer = await openViewer('cors');
    await viewer.waitForFunction(() => !(/** @type {HTMLButtonElement} */ (document.getElementById('save'))).disabled);
    await viewer.keyboard.press('r');
    const download = viewer.waitForEvent('download');
    await viewer.click('#save');
    const file = await download;
    assert.equal(file.suggestedFilename(), 'photo-rotated.png');
    const png = await readFile(await file.path());
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [200, 320], 'width and height swapped');
    if (shots) {
      await viewer.mouse.move(5, 400);
      await viewer.emulateMedia({ colorScheme: 'light' });
      await viewer.screenshot({ path: path.join(shots, 'viewer-light.png') });
      await viewer.emulateMedia({ colorScheme: 'dark' });
      await viewer.screenshot({ path: path.join(shots, 'viewer-dark.png') });
    }
    await viewer.close();
  });

  await check('viewer: a video plays turned, with no Save', async () => {
    const viewer = await openViewer('vid', 'video');
    const v = await viewerState(viewer);
    assert.equal(v.r, '90');
    assert.deepEqual(v.frame, [180, 320]);
    assert.equal(v.save.disabled, true);
    assert.match(v.save.title, /Videos can’t be saved/);
    if (shots) {
      await viewer.emulateMedia({ colorScheme: 'dark' });
      await viewer.screenshot({ path: path.join(shots, 'viewer-video-dark.png') });
    }
    await viewer.close();
  });

  await check('viewer: a narrow window keeps the toolbar usable', async () => {
    const viewer = await openViewer('cors');
    await viewer.setViewportSize({ width: 390, height: 700 });
    assert.equal(await viewer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scrolling');
    if (shots) await viewer.screenshot({ path: path.join(shots, 'viewer-narrow.png') });
    await viewer.close();
  });

  // --- Options and single-key mode ---

  /**
   * Open the options page, once it has listed the shortcuts (its last step).
   *
   * @returns {Promise<Page>} The page.
   */
  const openOptions = async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById('shortcuts')).children.length);
    return options;
  };
  /** @typedef {typeof globalThis & { syncWrites: number }} Counted The worker, counting sync writes. */
  const syncWrites = () => worker.evaluate(() => /** @type {Counted} */ (globalThis).syncWrites);

  await check('options: lists the shortcuts and shows every setting in English', async () => {
    const options = await openOptions();
    // Set shortcuts are listed; the way to change them is Chrome's own page, as a link row.
    assert.equal(await options.locator('#edit-shortcuts').innerText(), 'Keyboard shortcuts');
    assert.equal(await options.locator('#no-shortcuts').isVisible(), false);
    const text = await options.locator('main').innerText();
    assert.match(text, /Rotate the image under the pointer clockwise\s+(Alt|⌥)/);
    assert.match(text, /Single-key mode/);
    // The one-item hint names the viewer and reset shortcuts as they're set.
    assert.match(text, /press (Alt\+Shift\+V|⌥⇧V) to open it in a new tab; (Alt\+Shift\+0|⌥⇧0) resets it/);
    assert.match(await options.title(), /^Upright settings$/);
    assert.equal(await worker.evaluate(() => chrome.action.getTitle({})), 'Upright', 'the toolbar button’s tooltip');
    assert.ok(!/(options|command)[A-Z]/.test(text), 'no unlocalised message names');
    // Settings always sync now: there's no switch for it.
    assert.equal(await options.locator('#syncSettings').count(), 0);
    assert.doesNotMatch(text, /Sync settings/);
    // About card, last, as chrome://settings/help: the version Chrome loaded and the configured links.
    const { version } = JSON.parse(await readFile(path.join(root, 'extension', 'manifest.json'), 'utf8'));
    assert.equal(await options.locator('#version').innerText(), `Version ${version}`);
    assert.match(text, /About Upright\s+Upright\s+Version [\d.]+\s+Get help with Upright\s+Report an issue\s+Privacy policy\s*$/);
    assert.equal(await options.locator('#help').getAttribute('href'), ABOUT_LINKS.help);
    assert.equal(await options.locator('#report-issue').getAttribute('href'), ABOUT_LINKS.reportIssue);
    assert.equal(await options.locator('#privacy-policy').getAttribute('href'), ABOUT_LINKS.privacyPolicy);
    if (shots) {
      await options.emulateMedia({ colorScheme: 'light' });
      await options.screenshot({ path: path.join(shots, 'options-light.png'), fullPage: true });
      await options.emulateMedia({ colorScheme: 'dark' });
      await options.screenshot({ path: path.join(shots, 'options-dark.png'), fullPage: true });
    }
    await options.close();
  });

  await check('options: a burst of clicks is one write to Chrome Sync, after the clicks stop', async () => {
    await setSettings({ menuStyle: 'single', singleDirection: 'right' });
    await worker.evaluate(() => {
      const counted = /** @type {Counted} */ (globalThis);
      counted.syncWrites = 0;
      chrome.storage.sync.onChanged.addListener(() => { counted.syncWrites++; });
    });
    const options = await openOptions();
    await options.locator('#singleDirection').selectOption('left'); // Only while the one item is chosen.
    for (const style of ['full', 'single', 'full', 'single', 'full']) {
      await options.locator(`input[name="menuStyle"][value="${style}"]`).check();
    }
    assert.equal(await syncWrites(), 0, 'nothing written mid-burst');
    await until(async () => (await stored()).sync.menuStyle === 'full', 'the menu style to reach sync');
    await options.waitForTimeout(1500);
    assert.equal(await syncWrites(), 1);
    assert.equal((await stored()).sync.singleDirection, 'left');
    // The background rebuilt the menu from sync.
    await until(() => menuHas('rotate'), 'the full menu');
    // Reopened, the page shows what sync holds.
    await options.reload();
    assert.equal(await options.locator('input[name="menuStyle"][value="full"]').isChecked(), true);
    await options.close();
  });

  await check('options: closing the page writes a change still waiting', async () => {
    await setSettings({ menuStyle: 'single', singleDirection: 'right' });
    const options = await openOptions();
    await options.locator('#singleDirection').selectOption('left');
    await options.close({ runBeforeUnload: true });
    await until(async () => (await stored()).sync.singleDirection === 'left', 'the change to reach sync');
    await setSettings({ singleDirection: 'right' });
  });

  const registered = () => worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());

  await check('single-key mode: switching it on registers the content script for the granted sites', async () => {
    assert.deepEqual(await registered(), [], 'off by default: nothing runs in pages');
    // The e2e build already holds 127.0.0.1 (a test can't click Chrome's prompt).
    await setSettings({ singleKey: true, singleKeyScope: 'chosen', singleKeySites: [origin] });
    const [script] = await until(async () => ((await registered()).length ? registered() : null), 'the registration');
    assert.deepEqual(script.matches, ['http://127.0.0.1/*']);
    assert.equal(script.allFrames, true);
  });

  await check('options: the chosen sites are added in Chrome’s dialog with their access, and removed from their ⋮ menu', async () => {
    const options = await openOptions();
    assert.deepEqual(await options.locator('#singleKeySites li .label').allInnerTexts(), ['http://127.0.0.1']);
    assert.equal(await options.isVisible('#no-chosen-sites'), false);
    await options.getByRole('button', { name: 'More actions for http://127.0.0.1' }).click();
    await options.getByRole('menuitem', { name: 'Remove' }).click();
    await options.waitForSelector('#no-chosen-sites:not([hidden])');
    await until(async () => JSON.stringify((await stored()).local.singleKeySites) === '[]', 'the removal to be kept');
    // Access is asked for from the dialog's Add (the e2e build already holds 127.0.0.1).
    await options.click('#add-site');
    await options.fill('#text-dialog-input', 'http://127.0.0.1/page');
    await options.press('#text-dialog-input', 'Enter');
    await until(async () => JSON.stringify((await stored()).local.singleKeySites) === '["http://127.0.0.1"]', 'the site to be kept');
    // Edited from its ⋮ menu: the new site's access is asked for from the dialog's Save. (localhost
    // stands for a site whose access was taken back.)
    await setSettings({ singleKeySites: ['http://localhost', 'http://127.0.0.1'] });
    await options.getByRole('button', { name: 'More actions for http://localhost' }).click();
    await options.getByRole('menuitem', { name: 'Edit' }).click();
    await options.fill('#text-dialog-input', 'http://127.0.0.1');
    await options.press('#text-dialog-input', 'Enter');
    await until(async () => JSON.stringify((await stored()).local.singleKeySites) === '["http://127.0.0.1"]', 'the edit to be kept');
    assert.deepEqual(await options.locator('#singleKeySites li .label').allInnerTexts(), ['http://127.0.0.1']);
    await options.close();
  });

  await check('options: “Never on” adds what’s typed in Chrome’s dialog as a host, edits and removes it from its ⋮ menu', async () => {
    const options = await openOptions();
    const neverSites = async () => JSON.stringify((await stored()).sync.neverSites);
    assert.equal(await options.isVisible('#no-never-sites'), true);
    await options.click('#add-never');
    await options.fill('#text-dialog-input', 'not a site');
    assert.equal(await options.isDisabled('#text-dialog-confirm'), true);
    await options.fill('#text-dialog-input', ' https://www.YouTube.com/watch ');
    await options.press('#text-dialog-input', 'Enter');
    await until(async () => (await neverSites()) === '["youtube.com"]', 'the site to reach sync');
    assert.deepEqual(await options.locator('#neverSites li .label').allInnerTexts(), ['youtube.com']);
    assert.equal(await options.isVisible('#no-never-sites'), false);
    await options.getByRole('button', { name: 'More actions for youtube.com' }).click();
    await options.getByRole('menuitem', { name: 'Edit' }).click();
    await options.fill('#text-dialog-input', 'music.youtube.com');
    await options.press('#text-dialog-input', 'Enter');
    await until(async () => (await neverSites()) === '["music.youtube.com"]', 'the edit to reach sync');
    await options.getByRole('button', { name: 'More actions for music.youtube.com' }).click();
    await options.getByRole('menuitem', { name: 'Remove' }).click();
    await options.waitForSelector('#no-never-sites:not([hidden])');
    await until(async () => (await neverSites()) === '[]', 'the removal to reach sync');
    await options.close();
  });

  await load();
  await sleep(300); // The content script loads its module.

  /** @typedef {typeof window & { pageKeys: string[] }} KeyLog The test page, logging its own keydowns. */
  const clearPageKeys = () => page.evaluate(() => { /** @type {KeyLog} */ (window).pageKeys = []; });
  const pageKeys = () => page.evaluate(() => /** @type {KeyLog} */ (window).pageKeys);

  await check('single-key mode: R over an image turns it; L back; the page never sees those keys', async () => {
    await clearPageKeys();
    await hover('hover-a');
    await page.keyboard.press('r');
    await until(async () => (await drawn('hover-a')).rotate === '90deg', 'R to turn the image');
    await page.keyboard.press('l');
    await until(async () => (await drawn('hover-a')).state === null, 'L to turn it back');
    assert.deepEqual(await pageKeys(), []);
  });

  await check('single-key mode: over an overlay, R turns the photo underneath; 0 resets', async () => {
    await hover('overlay');
    await page.keyboard.press('r');
    await until(async () => (await drawn('under')).rotate === '90deg', 'R over the overlay');
    await page.keyboard.press('0');
    await until(async () => (await drawn('under')).state === null, '0 to reset');
  });

  await check('single-key mode: typing "r" in a field types it, and turns nothing', async () => {
    await page.click('#field');
    // The pointer stays over the field; move it over an image to be sure focus is what counts.
    await hover('hover-a');
    await page.keyboard.type('rrl0');
    assert.equal(await page.inputValue('#field'), 'rrl0');
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-rotate-image]').length), 0);
    await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).blur());
    await park();
  });

  await check('single-key mode: R with nothing hovered does nothing, and the page\'s own handler gets it', async () => {
    await clearPageKeys();
    await page.keyboard.press('r');
    assert.deepEqual(await pageKeys(), ['r']);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-rotate-image]').length), 0);
  });

  await check('single-key mode: H and V only with "Extra keys" on', async () => {
    await hover('hover-a');
    await page.keyboard.press('h');
    await sleep(200);
    assert.equal((await drawn('hover-a')).state, null, 'H is the page\'s while extra keys are off');
    await setSettings({ extraKeys: true });
    await sleep(200);
    await page.keyboard.press('h');
    await until(async () => (await drawn('hover-a')).scale === '-1 1', 'H to flip');
    await page.keyboard.press('0');
    await park();
  });

  await check('single-key mode: the never-on list and switching it off unregister the script', async () => {
    await setSettings({ neverSites: ['127.0.0.1'] });
    await until(async () => (await registered())[0]?.excludeMatches?.includes('*://127.0.0.1/*'), 'the exclusion');
    await setSettings({ singleKey: false });
    await until(async () => (await registered()).length === 0, 'the script to be unregistered');
    // Single-key mode, its scope and its sites stayed on this computer; nothing else is in local
    // but the toolbar glyph's scheme, which is this computer's too.
    const { sync, local } = await stored();
    for (const key of [...settingsStore.localKeys, 'toolbarDark']) assert.ok(!(key in sync), `${key} reached sync`);
    assert.deepEqual(Object.keys(local).filter((key) => key !== 'toolbarDark').sort(), [...settingsStore.localKeys].sort());
    assert.deepEqual(sync.neverSites, ['127.0.0.1']);
  });

  await check('the test page threw no errors', () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await launched.close();
  server.close();
}

finish();
