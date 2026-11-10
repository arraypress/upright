/**
 * The viewer: one image or video, full window, turned with CSS only. Never reads
 * pixels to show them, so media from any site works; "Save rotated copy" needs the
 * pixels and is offered only when the site allows reading them (CORS).
 *
 * @module viewer/viewer
 */
import { readViewerUrl, viewerUrl } from '../shared/rotate.js';
import { IDENTITY_STATE, step } from '../shared/transform.js';
import { copyFile, fitZoom, mediaName, nextZoom, turnedSize } from './viewer-math.js';
import { byId, setUpPage } from '../vendor/extension-kit/index.js';

/** @import { Point } from '../shared/transform.js' */

const message = setUpPage(chrome);

const { src, kind } = readViewerUrl(location.search);
let { state } = readViewerUrl(location.search);
/** @type {number | 'fit'} */
let zoom = 'fit';
/** @type {Point | null} The media's own size, once it has loaded. */
let natural = null;
/** @type {HTMLImageElement | HTMLVideoElement | null} */
let media = null;
/** @type {HTMLImageElement | null} A copy canvas may read, if the site allows it. */
let readable = null;

const stage = byId('stage');
const frame = byId('frame');

/**
 * Show a message instead of the media, and switch the toolbar off.
 *
 * @param {string} name - A message in _locales.
 * @returns {void}
 */
function showMessage(name) {
  frame.hidden = true;
  byId('message').textContent = message(name);
  byId('message').hidden = false;
  for (const button of document.querySelectorAll('[data-action]')) {
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }
}

const PADDING = 32;

/**
 * The zoom in use: a number, or the fit for the window now.
 *
 * @returns {number} 1 is actual size.
 */
const currentZoom = () =>
  zoom === 'fit' ? fitZoom(natural ?? [0, 0], state, [stage.clientWidth - PADDING, stage.clientHeight - PADDING]) : zoom;

/**
 * Show the current state and zoom, and keep the address in step (so a reload or a
 * bookmark keeps the turn).
 *
 * @returns {void}
 */
function render() {
  history.replaceState(null, '', viewerUrl(location.pathname, { src, kind, state }));
  if (!natural || !media) return;
  const z = currentZoom();
  const [width, height] = natural;
  const [frameWidth, frameHeight] = turnedSize(natural, state);
  // The frame takes the turned size, so the stage scrolls over all of it when zoomed in.
  frame.style.width = `${frameWidth * z}px`;
  frame.style.height = `${frameHeight * z}px`;
  media.style.width = `${width * z}px`;
  media.style.height = `${height * z}px`;
  media.style.transform = `translate(-50%, -50%) rotate(${state.r}deg) scaleX(${state.f ? -1 : 1})`;
  byId('zoom').textContent = `${Math.round(z * 100)}%`;
}

/** The viewer's own actions; anything else is a turn for step(). @type {Record<string, () => void>} */
const actions = {
  'zoom-in': () => (zoom = nextZoom(currentZoom(), 1)),
  'zoom-out': () => (zoom = nextZoom(currentZoom(), -1)),
  'actual-size': () => (zoom = 1),
  fit: () => (zoom = 'fit'),
  reset: () => {
    state = { ...IDENTITY_STATE };
    zoom = 'fit';
  },
  save: () => saveCopy(),
};

/**
 * Do an action from a button, a key or the right-click menu, and show the result.
 *
 * @param {string} action - A viewer action or a turn from transform.js.
 * @returns {void}
 */
function run(action) {
  if (actions[action]) actions[action]();
  else state = step(state, action);
  render();
}

const bar = document.querySelector('.viewer-bar');
if (!bar) throw new Error('viewer.html has no .viewer-bar');
bar.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
  if (button instanceof HTMLButtonElement && !button.disabled && button.dataset.action) run(button.dataset.action);
});

/** @type {Readonly<Record<string, string>>} */
const KEYS = {
  r: 'rotate-right', R: 'rotate-left', h: 'flip-horizontal', v: 'flip-vertical',
  0: 'reset', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out', _: 'zoom-out', f: 'fit', 1: 'actual-size',
};
document.addEventListener('keydown', (event) => {
  // Leave Chrome's own shortcuts alone (⌘R reloads, Ctrl+0 resets page zoom).
  if (event.ctrlKey || event.metaKey || event.altKey || !natural) return;
  const key = event.key.length === 1 && /[a-z]/i.test(event.key)
    ? (event.shiftKey ? event.key.toUpperCase() : event.key.toLowerCase())
    : event.key;
  const action = KEYS[key];
  if (!action) return;
  event.preventDefault();
  run(action);
});

addEventListener('resize', () => zoom === 'fit' && render());

// The right-click menu on this page: the service worker sends the action here, for this tab only.
const ownTab = chrome.tabs.getCurrent();
chrome.runtime.onMessage.addListener((/** @type {{ type?: string, tabId?: number, action?: string } | undefined} */ request) => {
  if (request?.type !== 'viewer-action') return;
  const { tabId, action = '' } = request;
  ownTab.then((tab) => {
    if (tab?.id === tabId) run(action);
  });
});

/**
 * A copy of the image that canvas may read.
 *
 * @returns {Promise<HTMLImageElement | null>} The copy, or null if the site doesn't allow it.
 */
async function readableCopy() {
  const probe = new Image();
  probe.crossOrigin = 'anonymous';
  probe.src = src;
  try {
    await probe.decode();
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    if (!context) return null;
    context.drawImage(probe, 0, 0);
    context.getImageData(0, 0, 1, 1); // Throws if the canvas is tainted.
    return probe;
  } catch {
    return null;
  }
}

/**
 * Download the image as turned now, at its full size.
 *
 * @returns {Promise<void>}
 */
async function saveCopy() {
  if (!readable || !natural) return;
  const [width, height] = [readable.naturalWidth || natural[0], readable.naturalHeight || natural[1]];
  const [outWidth, outHeight] = turnedSize([width, height], state);
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.translate(outWidth / 2, outHeight / 2);
  context.rotate((state.r * Math.PI) / 180);
  context.scale(state.f ? -1 : 1, 1);
  context.drawImage(readable, -width / 2, -height / 2, width, height);
  const { name, type } = copyFile(src);
  /** @type {Blob | null} */
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

/**
 * Offer "Save rotated copy" only when the pixels can be read; the reason shows as a
 * tooltip when they can't.
 *
 * @returns {void}
 */
function setUpSave() {
  const button = byId('save', HTMLButtonElement);
  const wrap = byId('save-wrap');
  if (kind === 'video') {
    wrap.title = message('viewerSaveVideo');
    return;
  }
  readableCopy().then((copy) => {
    readable = copy;
    button.disabled = !copy;
    // The wrapper holds the tooltip: a disabled button shows none of its own.
    wrap.title = copy ? '' : message('viewerSaveBlocked');
  });
}

/**
 * The <img> or <video> for `src`, which renders once it knows its own size.
 *
 * @returns {HTMLImageElement | HTMLVideoElement} The element, loading.
 */
function createMedia() {
  if (kind === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => {
      natural = [video.videoWidth, video.videoHeight];
      render();
    });
    return video;
  }
  const image = document.createElement('img');
  image.alt = '';
  image.addEventListener('load', () => {
    // An SVG with no size of its own reports 0; give it the default replaced-element size.
    natural = [image.naturalWidth || 300, image.naturalHeight || 150];
    render();
  });
  return image;
}

/**
 * Start: name the page, load the media, and work out whether it can be saved.
 *
 * @returns {void}
 */
function load() {
  if (!src) return showMessage('viewerNoSource');
  const name = mediaName(src);
  byId('name').textContent = name || src.slice(0, 80);
  document.title = name || message('extShortName');

  media = createMedia();
  media.addEventListener('error', () => showMessage('viewerLoadFailed'));
  media.src = src;
  frame.append(media);
  setUpSave();
  render();
}

load();
