/**
 * Store screenshots and promo tile for Upright → ../screenshot-*.png, ../promo-440x280.png.
 *
 *   node store/tools/make-screenshots.mjs
 *
 * Runs scripts/build-e2e.mjs and loads that build (a copy of extension/ plus the test hook
 * that exposes the menu-click and shortcut handlers, and access to http://127.0.0.1) in
 * Playwright's Chromium. Chrome's native right-click menu and keyboard shortcuts can't be driven headlessly, so the
 * shots call exactly what a click on "Rotate image" or a press of a shortcut calls, on real pages, with the
 * real pointer hovering. Everything inside the windows is a real capture: the turned photos, the
 * viewer and the settings page. The window frame, captions, labels and pointer are drawn.
 *
 * Pages are made up (no real sites) and served from 127.0.0.1; the address bar shows a made-up
 * name. Photos are CC0 from Wikimedia Commons, saved sideways here (photos/).
 *
 * @module store/tools/make-screenshots
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { storeFrame, testBuildDir } from '@arraypress/extension-kit/build';
import { listenLocally } from '../../scripts/local-server.mjs';
import { testHook } from '../../test/e2e/hook-client.mjs';

/** @import { Page } from 'playwright' */
const { H, THEMES, W, WIN, canvas, cursor, geometry, letterIcon, windowChrome } = storeFrame;
/** @typedef {Parameters<typeof windowChrome>[0]['tabs'][number]} Tab */

const ZOOMED = geometry(1.2);
const tools = path.dirname(fileURLToPath(import.meta.url));
const store = path.dirname(tools);
const root = path.dirname(store);
const tmp = await mkdtemp(path.join(tmpdir(), 'upright-store-'));
/**
 * @param {string} file - A local file.
 * @param {string} [type] - Its media type. Default PNG.
 * @returns {Promise<string>} It as a data: URL.
 */
const dataUrl = async (file, type = 'image/png') => `data:${type};base64,${(await readFile(file)).toString('base64')}`;
const EXT_ICON = await dataUrl(path.join(root, 'extension', 'icons', 'icon-32.png'));

execFileSync(process.execPath, [path.join(root, 'scripts', 'build-e2e.mjs')], { stdio: 'inherit' });
const extensionPath = testBuildDir(root);

// ---------------------------------------------------------------- made-up pages

const SITE = { brand: 'Coastline', color: '#0b6e99', icon: letterIcon('C', '#0b6e99') };
const PET = { brand: 'Pawprint', color: '#b0471d', icon: letterIcon('P', '#b0471d') };

const POST = `<!doctype html><html><head><meta charset="utf-8"><title>Meet Biscuit – Pawprint</title>
<link rel="icon" href="${PET.icon}">
<style>
  body { margin: 0; font: 15px/1.5 system-ui; color: #202124; background: #faf7f2; }
  header { padding: 14px 24px; border-bottom: 1px solid #ece4d8; background: #fff; font: 700 19px Georgia, serif; color: ${PET.color}; }
  article { margin: 18px 24px; padding: 18px; background: #fff; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .who { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  .who i { width: 32px; height: 32px; border-radius: 50%; background: #e8c9a8; display: block; }
  .who span { color: #80868b; font-weight: 400; font-size: 13px; }
  p { margin: 10px 0 12px; }
  img { display: block; margin: 0 auto; border-radius: 4px; }
</style></head><body>
<header>Pawprint</header>
<article><div class="who"><i></i>Sam <span>· 2h</span></div>
<p>Meet Biscuit, three months old and already running the house.</p>
<img src="/photos/biscuit.jpg" width="408" height="408" alt="A kitten">
</article></body></html>`;

const GALLERY = `<!doctype html><html><head><meta charset="utf-8"><title>Lighthouse walks: photos – Coastline</title>
<link rel="icon" href="${SITE.icon}">
<style>
  body { margin: 0; font: 15px/1.5 system-ui; color: #202124; background: #fff; }
  header { display: flex; align-items: center; gap: 24px; padding: 14px 32px; border-bottom: 1px solid #e8eaed; font: 500 14px system-ui; color: #5f6368; }
  header b { font: 700 20px Georgia, serif; color: ${SITE.color}; margin-right: auto; }
  h1 { font: 700 26px Georgia, serif; margin: 18px 32px 4px; }
  .sub { margin: 0 32px 16px; color: #5f6368; }
  .grid { display: flex; flex-wrap: wrap; gap: 14px; padding: 0 32px; }
  .grid figure { margin: 0; background: #f1f3f4; border-radius: 4px; }
  .grid img { display: block; }
</style></head><body>
<header><b>Coastline</b><span>Walks</span><span>Photos</span><span>Maps</span></header>
<h1>Lighthouse walks: your photos</h1><p class="sub">Shared by readers this week</p>
<div class="grid">
  <figure><img id="belle" src="/photos/belle.jpg" width="267" height="200" alt=""></figure>
  <figure><img id="zadar" src="/photos/zadar-lighthouse.jpg" width="303" height="200" alt=""></figure>
  <figure><img id="chania" src="/photos/chania-lighthouse.jpg" width="131" height="200" alt=""></figure>
  <figure><img id="lake" src="/photos/lake.jpg" width="300" height="200" alt=""></figure>
  <figure><img id="bierstadt" src="/photos/bierstadt.jpg" width="301" height="200" alt=""></figure>
</div></body></html>`;

const { server, origin } = await listenLocally(async (pathname, res) => {
  if (pathname === '/post') return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(POST);
  if (pathname === '/gallery') return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(GALLERY);
  const photo = /^\/photos\/([\w-]+\.jpg)$/.exec(pathname);
  if (!photo) return res.writeHead(404).end();
  try {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(await readFile(path.join(tools, 'photos', photo[1])));
  } catch {
    res.writeHead(404).end();
  }
});

// ---------------------------------------------------------------- browser

const context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
  channel: 'chromium',
  viewport: ZOOMED.content,
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
/**
 * @param {string} url - A page's URL.
 * @returns {Promise<chrome.tabs.Tab | undefined>} The tab showing it.
 */
const tabFor = (url) => worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0], url);
const hook = testHook(worker);

/**
 * Wait until the page and its images have loaded and settled.
 *
 * @param {Page} page - The page.
 * @returns {Promise<void>}
 */
async function ready(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await page.waitForTimeout(300);
}
/**
 * Screenshot the page's viewport.
 *
 * @param {Page} page - The page.
 * @param {string} file - A name for it in the temporary folder.
 * @returns {Promise<string>} The PNG as a data: URL.
 */
async function shoot(page, file) {
  const out = path.join(tmp, file);
  await page.screenshot({ path: out });
  return dataUrl(out);
}

/** @type {string[]} Each screenshot's HTML, in order. */
const shots = [];

// 1. Before and after "Rotate image" on a post (the default one-item menu, clockwise).
{
  const geo = { w: 560, content: { width: 560, height: H - WIN.y - WIN.strip - WIN.toolbar } };
  const page = await context.newPage();
  await page.setViewportSize(geo.content);
  await page.goto(`${origin}/post`);
  await ready(page);
  const before = await shoot(page, 'post-before.png');
  const src = await page.$eval('img', (img) => img.currentSrc);
  await hook.click({ menuItemId: 'rotate-image', srcUrl: src, pageUrl: `${origin}/post` }, await tabFor(`${origin}/post`));
  await page.waitForTimeout(400);
  const turned = await page.$eval('img', (img) => img.dataset.rotateImage);
  if (!turned) throw new Error('The post photo was not turned');
  const after = await shoot(page, 'post-after.png');
  await page.close();

  const tabs = [{ title: 'Meet Biscuit – Pawprint', icon: PET.icon, active: true }, { title: 'Lighthouse walks – Coastline', icon: SITE.icon }];
  /** @type {(x: number, img: string, label: string) => string} One window, its capture and a label. */
  const win = (x, img, label) => `<div class="win" style="left:${x}px">
    ${windowChrome({ tabs, url: 'pawprint.example/posts/meet-biscuit', urlHost: 'pawprint.example', w: geo.w })}
    <img src="${img}" width="${geo.content.width}" height="${geo.content.height}" alt="" style="display:block">
    <div class="tag">${label}</div></div>`;
  shots.push(`<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; position: relative; background: ${THEMES.light.bg}; -webkit-font-smoothing: antialiased; }
    .caption { position: absolute; left: 0; right: 0; top: 0; height: 112px; display: grid; place-items: center; font: 500 32px/1.2 system-ui; letter-spacing: -.2px; color: #1f1f1f; }
    .win { position: absolute; top: ${WIN.y}px; width: ${geo.w}px; height: ${H - WIN.y + 20}px; border-radius: 12px 12px 0 0; overflow: hidden; box-shadow: ${THEMES.light.shadow}; }
    .tag { position: absolute; right: 16px; bottom: 44px; padding: 7px 14px; border-radius: 18px; background: rgba(32,33,36,.86); color: #fff; font: 500 14px system-ui; }
  </style></head><body>
    <div class="caption">Turn sideways photos upright, right on the page</div>
    ${win(WIN.x, before, 'Before')}
    ${win(W - WIN.x - geo.w, after, 'After right-click › Rotate image')}
  </body></html>`);
}

// 2 and 3. Point at a photo in a gallery and press a shortcut (people set their own: none ship); then open it in the viewer.
const gallery = await context.newPage();
await gallery.setViewportSize(ZOOMED.content);
await gallery.goto(`${origin}/gallery`);
await ready(gallery);
const galleryTab = await tabFor(`${origin}/gallery`);
/**
 * @param {string} id - A photo's id in the gallery.
 * @returns {Promise<{ x: number, y: number }>} Its centre, in the page.
 */
const centre = async (id) => gallery.locator(`#${id}`).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
/**
 * @param {boolean} activeViewer - Whether the viewer's tab is open and selected.
 * @param {string} [viewerTitle] - Its title.
 * @returns {Tab[]} The gallery window's tabs.
 */
const galleryTabs = (activeViewer, viewerTitle = '') => [
  { title: 'Meet Biscuit – Pawprint', icon: PET.icon },
  { title: 'Lighthouse walks: photos – Coastline', icon: SITE.icon, active: !activeViewer },
  ...(activeViewer ? [{ title: viewerTitle, icon: EXT_ICON, active: true }] : []),
];
{
  const at = await centre('zadar');
  await gallery.mouse.move(at.x + 20, at.y + 30);
  await hook.command('rotate-right', galleryTab);
  await gallery.waitForTimeout(400);
  if (!(await gallery.locator('#zadar').getAttribute('data-rotate-image'))) throw new Error('Shortcut did not turn the photo');
  const page = await shoot(gallery, 'gallery.png');
  const z = ZOOMED.zoom;
  const px = WIN.x + (at.x + 20) * z;
  const py = WIN.y + (WIN.strip + WIN.toolbar + at.y + 30) * z;
  shots.push(canvas({
    caption: 'Or point at it and press a shortcut you choose',
    chrome: windowChrome({ tabs: galleryTabs(false), url: 'coastline.example/lighthouse-walks/photos', urlHost: 'coastline.example', w: ZOOMED.w }),
    content: page,
    geo: ZOOMED,
    overlays: '',
  }).replace('</body>', `${cursor(px, py)}</body>`));
}
{
  const at = await centre('zadar');
  await gallery.mouse.move(at.x, at.y);
  const opened = context.waitForEvent('page');
  await hook.command('open-viewer', galleryTab);
  const viewer = await opened;
  await viewer.setViewportSize(ZOOMED.content);
  await ready(viewer);
  const page = await shoot(viewer, 'viewer-light.png');
  shots.push(canvas({
    caption: 'Rotate, flip and zoom in the viewer',
    chrome: windowChrome({ tabs: galleryTabs(true, await viewer.title()), url: viewer.url(), w: ZOOMED.w, ext: [] }),
    content: page,
    geo: ZOOMED,
  }));
  await viewer.close();
}

// 4. Settings (light).
{
  const page = await context.newPage();
  await page.setViewportSize(ZOOMED.content);
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  await ready(page);
  const shot = await shoot(page, 'options.png');
  shots.push(canvas({
    caption: 'One menu item, or the full menu',
    chrome: windowChrome({
      tabs: [{ title: 'Lighthouse walks: photos – Coastline', icon: SITE.icon }, { title: await page.title(), icon: EXT_ICON, active: true }],
      url: `chrome-extension://${extensionId}/options/options.html`, w: ZOOMED.w,
    }),
    content: shot,
    geo: ZOOMED,
  }));
  await page.close();
}

// 5. The viewer in dark mode: a shortcut turns the other sideways photo, another opens it, then zoom in.
{
  const at = await centre('chania');
  await gallery.mouse.move(at.x, at.y);
  await hook.command('rotate-left', galleryTab);
  await gallery.waitForTimeout(300);
  const opened = context.waitForEvent('page');
  await hook.command('open-viewer', galleryTab);
  const viewer = await opened;
  await viewer.emulateMedia({ colorScheme: 'dark' });
  await viewer.setViewportSize(ZOOMED.content);
  await ready(viewer);
  await viewer.locator('[data-action="zoom-in"]').click();
  await viewer.mouse.move(0, ZOOMED.content.height - 1);
  await viewer.waitForTimeout(300);
  const page = await shoot(viewer, 'viewer-dark.png');
  shots.push(canvas({
    caption: 'Open it full-window for a closer look',
    theme: 'dark',
    chrome: windowChrome({ tabs: galleryTabs(true, await viewer.title()), url: viewer.url(), w: ZOOMED.w, theme: 'dark' }),
    content: page,
    geo: ZOOMED,
  }));
}

await context.close();
server.close();

// ---------------------------------------------------------------- render

const browser = await chromium.launch();
const render = await browser.newPage({ viewport: { width: W, height: H } });
for (const [i, html] of shots.entries()) {
  const file = path.join(tmp, `shot-${i + 1}.html`);
  await writeFile(file, html);
  await render.goto(`file://${file}`);
  await render.waitForTimeout(300);
  await render.screenshot({ path: path.join(store, `screenshot-${i + 1}.png`) });
  console.log(`store/screenshot-${i + 1}.png`);
}

// Promo tile, 440×280: the icon drawn from extension/icons/icon.svg, so it's sharp at any size.
{
  const svg = await readFile(path.join(root, 'extension', 'icons', 'icon.svg'), 'utf8');
  await render.setViewportSize({ width: 440, height: 280 });
  const file = path.join(tmp, 'promo.html');
  await writeFile(file, `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 440px; height: 280px; overflow: hidden; display: grid; place-items: center; background: linear-gradient(160deg, #f3f6fb, #dde3ea); -webkit-font-smoothing: antialiased; font-family: system-ui; }
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .icon { width: 112px; height: 112px; filter: drop-shadow(0 6px 14px rgba(11,87,208,.28)); }
    .icon svg { width: 100%; height: 100%; }
    h1 { margin: 0; font: 600 30px/1.1 system-ui; color: #1f1f1f; letter-spacing: -.3px; }
    p { margin: 0; font: 400 17px system-ui; color: #444746; }
  </style><div class="wrap"><div class="icon">${svg}</div><h1>Upright</h1><p>Turn sideways images upright</p></div>`);
  await render.goto(`file://${file}`);
  await render.screenshot({ path: path.join(store, 'promo-440x280.png') });
  console.log('store/promo-440x280.png');
}
await browser.close();
await rm(tmp, { recursive: true, force: true });
