/**
 * The viewer: one image or video, full window, turned with CSS only. Never reads
 * pixels to show them, so media from any site works; "Save rotated copy" needs the
 * pixels and is offered only when the site allows reading them (CORS).
 */
import { readViewerUrl, viewerUrl } from '../shared/rotate.js';
import { IDENTITY_STATE, step } from '../shared/transform.js';
import { copyFile, fitZoom, nextZoom, turnedSize } from './viewer-math.js';
import { watchColorScheme } from '../shared/toolbar-scheme.js';

const message = (name) => chrome.i18n.getMessage(name);
const $ = (id) => document.getElementById(id);

// The toolbar glyph follows this page's light or dark scheme (toolbar-theme.js).
watchColorScheme().catch((error) => console.debug('Reporting the colour scheme:', error));

for (const el of document.querySelectorAll('[data-i18n-title]')) {
  el.title = message(el.dataset.i18nTitle);
  el.setAttribute('aria-label', el.title);
}

const { src, kind } = readViewerUrl(location.search);
let { state } = readViewerUrl(location.search);
let zoom = 'fit';
let natural = null;
let media = null;
let readable = null;

const stage = $('stage');
const frame = $('frame');

function showMessage(name) {
  frame.hidden = true;
  $('message').textContent = message(name);
  $('message').hidden = false;
  for (const button of document.querySelectorAll('[data-action]')) button.disabled = true;
}

const PADDING = 32;
const currentZoom = () =>
  zoom === 'fit' ? fitZoom(natural, state, [stage.clientWidth - PADDING, stage.clientHeight - PADDING]) : zoom;

function render() {
  history.replaceState(null, '', viewerUrl(location.pathname, { src, kind, state }));
  if (!natural) return;
  const z = currentZoom();
  const [width, height] = natural;
  const [frameWidth, frameHeight] = turnedSize(natural, state);
  // The frame takes the turned size, so the stage scrolls over all of it when zoomed in.
  frame.style.width = `${frameWidth * z}px`;
  frame.style.height = `${frameHeight * z}px`;
  media.style.width = `${width * z}px`;
  media.style.height = `${height * z}px`;
  media.style.transform = `translate(-50%, -50%) rotate(${state.r}deg) scaleX(${state.f ? -1 : 1})`;
  $('zoom').textContent = `${Math.round(z * 100)}%`;
}

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

function run(action) {
  if (actions[action]) actions[action]();
  else state = step(state, action);
  render();
}

document.querySelector('.viewer-bar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled) run(button.dataset.action);
});

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
chrome.runtime.onMessage.addListener((request) => {
  if (request?.type !== 'viewer-action') return;
  ownTab.then((tab) => {
    if (tab?.id === request.tabId) run(request.action);
  });
});

/** A copy of the image that canvas may read, or null if the site doesn't allow it. */
async function readableCopy() {
  const probe = new Image();
  probe.crossOrigin = 'anonymous';
  probe.src = src;
  try {
    await probe.decode();
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    context.drawImage(probe, 0, 0);
    context.getImageData(0, 0, 1, 1); // Throws if the canvas is tainted.
    return probe;
  } catch {
    return null;
  }
}

async function saveCopy() {
  if (!readable) return;
  const [width, height] = [readable.naturalWidth || natural[0], readable.naturalHeight || natural[1]];
  const [outWidth, outHeight] = turnedSize([width, height], state);
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext('2d');
  context.translate(outWidth / 2, outHeight / 2);
  context.rotate((state.r * Math.PI) / 180);
  context.scale(state.f ? -1 : 1, 1);
  context.drawImage(readable, -width / 2, -height / 2, width, height);
  const { name, type } = copyFile(src);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

function setUpSave() {
  const button = $('save');
  const wrap = $('save-wrap');
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

function load() {
  if (!src) return showMessage('viewerNoSource');
  const name = (() => {
    try {
      const url = new URL(src);
      return url.protocol === 'data:' ? '' : decodeURIComponent(url.pathname.split('/').pop() ?? '');
    } catch {
      return '';
    }
  })();
  $('name').textContent = name || src.slice(0, 80);
  document.title = name || message('viewerTitle');

  media = document.createElement(kind === 'video' ? 'video' : 'img');
  media.alt = '';
  if (kind === 'video') {
    media.controls = true;
    media.playsInline = true;
    media.addEventListener('loadedmetadata', () => {
      natural = [media.videoWidth, media.videoHeight];
      render();
    });
  } else {
    media.addEventListener('load', () => {
      // An SVG with no size of its own reports 0; give it the default replaced-element size.
      natural = [media.naturalWidth || 300, media.naturalHeight || 150];
      render();
    });
  }
  media.addEventListener('error', () => showMessage('viewerLoadFailed'));
  media.src = src;
  frame.append(media);
  setUpSave();
  render();
}

load();
