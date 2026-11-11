/**
 * The service worker: builds the right-click menu, answers its clicks and the keyboard
 * shortcuts, keeps single-key mode's content script registered, and starts the toolbar
 * glyph's light/dark theme.
 *
 * @module background/background
 */
import { actionFor, menuItems, OPEN_ID } from './menu.js';
import { mediaUnderPointer, readViewerUrl, rotateInPage, stateInPage, viewerUrl } from '../shared/rotate.js';
import { SCRIPT_ID, wantedScript } from '../shared/registration.js';
import { DEFAULTS, settingsStore } from '../shared/settings.js';
import { contentScriptSync, startToolbarTheme } from '../vendor/extension-kit/index.js';

/** @import { ViewerMedia } from '../shared/rotate.js' */

/**
 * @param {string} name - A message in _locales.
 * @returns {string} It, in the browser's language.
 */
const message = (name) => chrome.i18n.getMessage(name);
const VIEWER = chrome.runtime.getURL('viewer/viewer.html');

/**
 * Create one menu item. chrome.contextMenus.create has no promise form, so this wraps
 * its callback; a failure is logged, not thrown, so one bad item can't stop the rest.
 *
 * @param {chrome.contextMenus.CreateProperties} props - The item.
 * @returns {Promise<void>} Resolves once Chrome has made it (or refused).
 */
function create(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      if (chrome.runtime.lastError) console.error(`Creating "${props.id}":`, chrome.runtime.lastError.message);
      resolve();
    });
  });
}

/** The last menu rebuild, so the next waits for it. */
let rebuilding = Promise.resolve();

/**
 * Rebuild the menu for the current settings. Rebuilds are queued, so a quick run of
 * setting changes can't interleave one rebuild's creates with another's removeAll
 * (which is how duplicate ids would happen).
 *
 * @returns {Promise<void>} Settles once this rebuild is done; errors are logged.
 */
function buildMenu() {
  rebuilding = rebuilding
    .then(async () => {
      const settings = await settingsStore.load(chrome.storage);
      await chrome.contextMenus.removeAll();
      for (const item of menuItems(settings, message)) await create(item);
    })
    .catch((error) => console.error('Building the menu:', error));
  return rebuilding;
}

/**
 * Open the viewer in a new tab just after `tab`.
 *
 * @param {chrome.tabs.Tab} tab - The tab the media is in.
 * @param {ViewerMedia} media - What to show.
 * @returns {Promise<chrome.tabs.Tab>} The new tab.
 */
function openViewer(tab, media) {
  return chrome.tabs.create({
    url: viewerUrl(VIEWER, media),
    windowId: tab.windowId,
    index: tab.index + 1,
    openerTabId: tab.id,
  });
}

/**
 * What the menu does when clicked. Exported for the e2e build's test hook.
 *
 * @param {chrome.contextMenus.OnClickData} info - What Chrome says was clicked.
 * @param {chrome.tabs.Tab} [tab] - The tab it was clicked in.
 * @returns {Promise<void>}
 */
export async function handleMenuClick(info, tab) {
  if (!tab?.id || tab.id < 0 || !info.srcUrl) return;
  const settings = await settingsStore.load(chrome.storage).catch(() => DEFAULTS);
  const action = actionFor(String(info.menuItemId), settings);
  if (!action) return;
  const kind = info.mediaType === 'video' ? 'video' : 'image';

  // On our own viewer: Chrome won't script extension pages, and it has its own controls,
  // so hand it the action. Opening another viewer would only stack up tabs.
  const pageUrl = info.pageUrl ?? tab.url ?? '';
  if (pageUrl.startsWith(VIEWER)) {
    if (action === OPEN_ID) {
      await openViewer(tab, { src: info.srcUrl, kind, state: readViewerUrl(new URL(pageUrl).search).state });
    } else {
      await chrome.runtime.sendMessage({ type: 'viewer-action', tabId: tab.id, action }).catch(() => {});
    }
    return;
  }

  const where = { tabId: tab.id, frameId: info.frameId ?? 0, srcUrl: info.srcUrl };
  if (action === OPEN_ID) {
    await openViewer(tab, { src: info.srcUrl, kind, state: await stateInPage(chrome.scripting, where) });
    return;
  }
  try {
    const { found } = await rotateInPage(chrome.scripting, { ...where, action });
    // Not found (e.g. the page swapped the element out): nothing to do. Never open a tab
    // instead; only "Open in new tab" does that.
    if (!found) console.debug('Upright: no element shows', info.srcUrl);
  } catch (error) {
    // Expected for frames from another site: activeTab covers the tab's own site only.
    console.debug('Upright: can\'t reach that frame:', error instanceof Error ? error.message : error);
  }
}

/** The manifest's commands. */
const COMMANDS = ['rotate-right', 'rotate-left', 'reset', 'open-viewer'];

/**
 * A keyboard shortcut, for the media under the pointer in the active tab: turn it, or
 * open it in the viewer at its current turn. Pressing it grants activeTab, so no host
 * permission is needed. Exported for the e2e test hook.
 *
 * @param {string} command - The command's name in the manifest.
 * @param {chrome.tabs.Tab} [tab] - The active tab, if Chrome passed it.
 * @returns {Promise<void>}
 */
export async function handleCommand(command, tab) {
  if (!COMMANDS.includes(command)) return;
  tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab?.id || tab.id < 0) return;
  if (command === 'open-viewer') {
    // On the viewer itself (unscriptable) or with nothing hovered: nothing to open.
    const media = await mediaUnderPointer(chrome.scripting, tab.id).catch(() => null);
    if (media) await openViewer(tab, media);
    else console.debug('Upright: nothing under the pointer to open');
    return;
  }
  try {
    const { found } = await rotateInPage(chrome.scripting, { tabId: tab.id, srcUrl: null, action: command });
    if (!found) console.debug('Upright: nothing under the pointer');
  } catch {
    // Chrome won't script this tab. If it's our viewer, it turns its own media; any
    // other page simply has no listener for this.
    await chrome.runtime.sendMessage({ type: 'viewer-action', tabId: tab.id, action: command }).catch(() => {});
  }
}

/** Settings that change the menu; the rest change single-key mode's registration. */
const MENU_KEYS = ['menuStyle', 'singleDirection'];

/** Bring single-key mode's registration in line with the settings and the sites Chrome has granted. */
const syncRegistration = contentScriptSync(chrome.scripting, SCRIPT_ID, async () => wantedScript(
  await settingsStore.load(chrome.storage),
  (origins) => chrome.permissions.contains({ origins }),
));

/**
 * Bring single-key mode's registration up to date, logging (not throwing) a failure.
 *
 * @returns {Promise<void>}
 */
const resync = () => syncRegistration().catch((error) => console.error('Registering keys:', error));

/**
 * On install, update and browser start: retry any settings change Chrome Sync refused
 * earlier (kept on this computer), then build the menu and the registration.
 *
 * @returns {Promise<void>}
 */
async function startUp() {
  await settingsStore.retryUnsynced(chrome.storage).catch((error) => console.error('Retrying settings sync:', error));
  await Promise.all([buildMenu(), resync()]);
}

// Listeners are registered at top level so they attach every time the service worker wakes.
chrome.runtime.onInstalled.addListener(startUp);
chrome.runtime.onStartup.addListener(startUp);
// Settings changed here, in another tab or on another computer (through Chrome Sync).
chrome.storage.onChanged.addListener((changes, area) => {
  const keys = settingsStore.changed(changes, area);
  if (keys.some((key) => MENU_KEYS.includes(key))) buildMenu();
  if (keys.some((key) => !MENU_KEYS.includes(key))) resync();
});
// Sites can be granted or revoked from chrome://extensions as well as from our options.
chrome.permissions.onAdded.addListener(resync);
chrome.permissions.onRemoved.addListener(resync);
chrome.commands.onCommand.addListener((command, tab) => {
  handleCommand(command, tab).catch((error) => console.error('Shortcut:', error));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab).catch((error) => console.error('Menu click:', error));
});

// Toolbar icon: open the settings page, as Upright has no popup.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// The toolbar glyph follows light and dark mode, reported by the options page, the viewer and an
// offscreen watcher. Every start: Chrome shows the manifest's light glyph after a restart or
// re-enable, and closes the offscreen watcher on quit.
startToolbarTheme(chrome);
