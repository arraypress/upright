/**
 * Drawing kit for store screenshots: a 1280×800 canvas with a caption band and a Chrome window
 * (macOS, light or dark, default theme). Everything here is presentation around real captures;
 * nothing is a feature of the extension.
 *
 * Window metrics follow Chrome's 2023 refresh on macOS (tabs 34px high in a 42px strip, a 46px
 * toolbar with a pill omnibox).
 *
 * @module store/tools/frame
 */

/** The store screenshot's width. */
export const W = 1280;
/** The store screenshot's height. */
export const H = 800;
const CAPTION_H = 112;
/** Where the window sits: its left edge, top edge, full width, and tab strip and toolbar heights. */
export const WIN = { x: 64, y: CAPTION_H, w: 1152, strip: 42, toolbar: 46 };

/**
 * How a shot's window is laid out.
 *
 * @typedef {object} Geometry
 * @property {number} zoom The window's scale.
 * @property {number} w The window's unscaled width.
 * @property {{ width: number, height: number }} content The size to capture page content at.
 */

/**
 * A shot's window is drawn at `zoom` (scaled about its top-left corner) so text stays legible
 * when the store shows screenshots small. Content is captured at 2× so the scaling stays sharp.
 *
 * @param {number} [zoom] - The window's scale. Default 1.
 * @returns {Geometry} The window's unscaled width and the size to capture page content at.
 */
export function geometry(zoom = 1) {
  const w = Math.round((W - 2 * WIN.x) / zoom);
  return { zoom, w, content: { width: w, height: Math.round((H - WIN.y) / zoom) - WIN.strip - WIN.toolbar } };
}

/**
 * @param {unknown} s - Text.
 * @returns {string} It, escaped for HTML text and attributes.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Material icon paths (24×24). */
const P = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  forward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  reload: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  puzzle: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
  star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  sound: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  muted: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
};

/**
 * A Material icon as inline SVG, in the text colour.
 *
 * @param {keyof typeof P} name - Which icon.
 * @param {number} [size] - Width and height in px. Default 20.
 * @returns {string} The SVG markup.
 */
const icon = (name, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="currentColor" d="${P[name]}"/></svg>`;

/**
 * A letter favicon for made-up sites (no real brands).
 *
 * @param {string} letter - The letter.
 * @param {string} bg - Background colour.
 * @param {string} [fg] - Letter colour. Default white.
 * @returns {string} A data: URL of the SVG.
 */
export const letterIcon = (letter, bg, fg = '#fff') =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${bg}"/><text x="8" y="12" font-family="-apple-system,Helvetica,Arial" font-size="11" font-weight="700" text-anchor="middle" fill="${fg}">${letter}</text></svg>`)}`;

/** Chrome's light and dark window colours, and the canvas behind. */
export const THEMES = {
  light: {
    bg: '#eef2f8', caption: '#1f1f1f', sub: '#444746',
    frame: '#dde3ea', tabText: '#1f1f1f', tabTextInactive: '#474747', tabSep: '#a8afb8', activeTab: '#ffffff',
    toolbar: '#ffffff', toolbarIcon: '#474747', omnibox: '#e9eef6', url: '#1f1f1f', urlDim: '#5e5e5e',
    contentLine: '#d3d7dc', shadow: '0 24px 60px rgba(31,45,70,.20), 0 0 0 .5px rgba(0,0,0,.18)',
  },
  dark: {
    bg: '#1b1c1f', caption: '#e3e3e3', sub: '#c4c7c5',
    frame: '#1f1f1f', tabText: '#e3e3e3', tabTextInactive: '#c7c7c7', tabSep: '#5f6368', activeTab: '#3c3c3c',
    toolbar: '#3c3c3c', toolbarIcon: '#c7c7c7', omnibox: '#282828', url: '#e3e3e3', urlDim: '#a8a8a8',
    contentLine: '#2a2a2a', shadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 .5px rgba(255,255,255,.14)',
  },
};

/** @typedef {keyof typeof THEMES} Theme */

/**
 * One tab in the drawn window.
 *
 * @typedef {object} Tab
 * @property {string} title Its title.
 * @property {string} icon Its favicon's URL.
 * @property {boolean} [active] The selected tab.
 * @property {boolean} [audible] Playing sound.
 * @property {boolean} [muted] Muted.
 */

const TAB_H = 34;

/**
 * Lay out tabs like Chrome: equal widths up to 240px, shrinking to fit.
 *
 * @param {readonly Tab[]} tabs - The tabs.
 * @param {number} w - The window's width.
 * @returns {{ x: number, width: number }[]} Each tab's window-relative x and width.
 */
function tabLayout(tabs, w) {
  const left = 84;
  const right = 60;
  const max = 240;
  const avail = w - left - right - 36;
  const width = Math.min(max, Math.floor(avail / tabs.length));
  return tabs.map((_, i) => ({ x: left + i * width, width }));
}

/**
 * The window's tab strip and toolbar, as HTML. Positions are window-relative.
 *
 * @param {object} options - What to draw.
 * @param {readonly Tab[]} options.tabs - The tabs, left to right.
 * @param {string} options.url - The address bar's text.
 * @param {string} [options.urlHost] - The start of `url` to show in full; the rest is dimmed.
 * @param {Theme} [options.theme] - Default light.
 * @param {number} [options.w] - The window's width. Default the full window.
 * @param {readonly string[]} [options.ext] - Toolbar extension icons' URLs.
 * @returns {string} The HTML, with its own styles.
 */
export function windowChrome({ tabs, url, urlHost, theme = 'light', w = WIN.w, ext = [] }) {
  const t = THEMES[theme];
  const layout = tabLayout(tabs, w);
  const tabHtml = tabs.map((tab, i) => {
    const { x, width } = layout[i];
    const sepAfter = i < tabs.length - 1 && !tab.active && !tabs[i + 1].active;
    const alert = tab.muted ? icon('muted', 16) : tab.audible ? icon('sound', 16) : '';
    const showClose = tab.active || width >= 120;
    return `<div class="tab${tab.active ? ' active' : ''}" style="left:${x}px;width:${width}px">
      <img class="fav" src="${tab.icon}" width="16" height="16" alt="">
      <span class="title">${esc(tab.title)}</span>
      ${alert ? `<span class="alert">${alert}</span>` : ''}
      ${showClose ? `<span class="x">${icon('close', 14)}</span>` : ''}
    </div>${sepAfter ? `<span class="sep" style="left:${x + width - 1}px"></span>` : ''}`;
  }).join('');
  const last = layout[layout.length - 1];
  const plusX = last.x + last.width + 4;
  const extIcons = ext.map((src) => `<img src="${src}" width="16" height="16" alt="" style="margin:0 9px">`).join('');
  return `
  <div class="strip">
    <span class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
    ${tabHtml}
    <span class="plus" style="left:${plusX}px">${icon('add', 18)}</span>
  </div>
  <div class="toolbar">
    <span class="tb">${icon('back')}</span><span class="tb dim">${icon('forward')}</span><span class="tb">${icon('reload')}</span>
    <div class="omni"><span class="site">${icon('tune', 16)}</span><span class="url">${urlHost ? `${esc(urlHost)}<span class="dim">${esc(url.slice(urlHost.length))}</span>` : esc(url)}</span><span class="star">${icon('star', 18)}</span></div>
    ${extIcons}<span class="tb">${icon('puzzle')}</span>
    <span class="avatar">${icon('person', 18)}</span><span class="tb">${icon('more')}</span>
  </div>
  <style>
    .strip { position: relative; height: ${WIN.strip}px; background: ${t.frame}; }
    .lights { position: absolute; left: 16px; top: 15px; display: flex; gap: 8px; }
    .lights i { width: 12px; height: 12px; border-radius: 50%; display: block; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.12); }
    .tab { position: absolute; bottom: 0; height: ${TAB_H}px; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 14px; box-sizing: border-box; color: ${t.tabTextInactive}; font: 12px/16px system-ui; }
    .tab.active { background: ${t.activeTab}; color: ${t.tabText}; border-radius: 10px 10px 0 0; z-index: 1; }
    .tab.active::before, .tab.active::after { content: ''; position: absolute; bottom: 0; width: 10px; height: 10px; }
    .tab.active::before { left: -10px; background: radial-gradient(circle at 0 0, transparent 10px, ${t.activeTab} 10.5px); }
    .tab.active::after { right: -10px; background: radial-gradient(circle at 100% 0, transparent 10px, ${t.activeTab} 10.5px); }
    .tab .fav { flex: none; }
    .tab .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent); }
    .tab .alert, .tab .x { flex: none; display: flex; color: ${t.toolbarIcon}; }
    .sep { position: absolute; bottom: 9px; width: 1px; height: 18px; background: ${t.tabSep}; }
    .plus { position: absolute; top: 11px; display: flex; color: ${t.toolbarIcon}; padding: 2px; }
    .toolbar { height: ${WIN.toolbar}px; background: ${t.toolbar}; display: flex; align-items: center; gap: 4px; padding: 0 8px; box-sizing: border-box; border-bottom: 1px solid ${t.contentLine}; }
    .tb { width: 34px; height: 34px; display: grid; place-items: center; color: ${t.toolbarIcon}; flex: none; }
    .tb.dim { opacity: .45; }
    .omni { flex: 1; min-width: 0; height: 34px; margin: 0 8px; border-radius: 17px; background: ${t.omnibox}; display: flex; align-items: center; gap: 10px; padding: 0 12px; color: ${t.url}; font: 14px system-ui; }
    .omni .site { display: flex; color: ${t.toolbarIcon}; }
    .omni .url { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .omni .dim { color: ${t.urlDim}; }
    .omni .star { display: flex; color: ${t.toolbarIcon}; }
    .avatar { flex: none; width: 26px; height: 26px; margin: 0 4px; border-radius: 50%; background: #7cacf8; color: #fff; display: grid; place-items: end center; overflow: hidden; }
  </style>`;
}

/**
 * The macOS arrow pointer.
 *
 * @param {number} x - Its tip, across the canvas.
 * @param {number} y - Its tip, down the canvas.
 * @returns {string} Absolutely positioned SVG.
 */
export const cursor = (x, y) => `<svg style="position:absolute;left:${x - 4}px;top:${y - 3}px;z-index:20;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))" width="22" height="30" viewBox="0 0 22 30">
  <path d="M4 3 L4 24 L9 19.5 L12.4 27 L15.6 25.6 L12.3 18.3 L19 18.3 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/**
 * The full page: caption band, window, content and overlays.
 *
 * @param {object} options - What to draw.
 * @param {string} options.caption - The headline above the window.
 * @param {Theme} [options.theme] - Default light.
 * @param {string} options.chrome - From windowChrome.
 * @param {string} options.content - An <img> src (a capture at `geo.content` size) or raw HTML.
 * @param {string} [options.overlays] - HTML drawn over the window.
 * @param {Geometry} [options.geo] - Default geometry(1).
 * @returns {string} A whole HTML document, W×H.
 */
export function canvas({ caption, theme = 'light', chrome, content, overlays = '', geo = geometry(1) }) {
  const t = THEMES[theme];
  const { width: cw, height: ch } = geo.content;
  const inner = content.startsWith('<') ? content : `<img src="${content}" width="${cw}" height="${ch}" alt="" style="display:block">`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; }
    body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; background: ${t.bg}; -webkit-font-smoothing: antialiased; }
    .caption { position: absolute; left: 0; right: 0; top: 0; height: ${CAPTION_H}px; display: grid; place-items: center; font: 500 32px/1.2 system-ui; letter-spacing: -.2px; color: ${t.caption}; }
    .stage { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform: scale(${geo.zoom}); transform-origin: ${WIN.x}px ${WIN.y}px; }
    .window { position: absolute; left: ${WIN.x}px; top: ${WIN.y}px; width: ${geo.w}px; height: ${ch + WIN.strip + WIN.toolbar + 20}px; border-radius: 12px 12px 0 0; overflow: hidden; box-shadow: ${t.shadow}; }
    .content { position: absolute; left: 0; top: ${WIN.strip + WIN.toolbar}px; width: ${cw}px; height: ${ch}px; overflow: hidden; background: ${theme === 'dark' ? '#202124' : '#fff'}; }
  </style></head><body>
    <div class="caption">${caption}</div>
    <div class="stage"><div class="window">${chrome}<div class="content">${inner}</div></div>
    ${overlays}</div>
  </body></html>`;
}
