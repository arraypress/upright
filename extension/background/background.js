import { actionFor, menuItems, OPEN_ID } from './menu.js';
import { mediaUnderPointer, readViewerUrl, rotateInPage, stateInPage, viewerUrl } from '../shared/rotate.js';
import { syncRegistration } from '../shared/registration.js';
import { changedSettings, DEFAULTS, loadSettings } from '../shared/settings.js';
import { moveSettingsToSync } from './migrate.js';
import { createToolbarTheme, watchFromOffscreen } from './toolbar-theme.js';

const message = (name) => chrome.i18n.getMessage(name);
const VIEWER = chrome.runtime.getURL('viewer/viewer.html');

function create(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      if (chrome.runtime.lastError) console.error(`Creating "${props.id}":`, chrome.runtime.lastError.message);
      resolve();
    });
  });
}

/**
 * Rebuild the menu for the current settings. Rebuilds are queued, so a quick run of
 * setting changes can't interleave one rebuild's creates with another's removeAll
 * (which is how duplicate ids would happen).
 */
let rebuilding = Promise.resolve();
export function buildMenu() {
  rebuilding = rebuilding
    .then(async () => {
      const settings = await loadSettings(chrome.storage);
      await chrome.contextMenus.removeAll();
      for (const item of menuItems(settings, message)) await create(item);
    })
    .catch((error) => console.error('Building the menu:', error));
  return rebuilding;
}

function openViewer(tab, media) {
  return chrome.tabs.create({
    url: viewerUrl(VIEWER, media),
    windowId: tab.windowId,
    index: tab.index + 1,
    openerTabId: tab.id,
  });
}

/** What the menu does when clicked. Exported for the e2e build's test hook. */
export async function handleMenuClick(info, tab) {
  if (!tab?.id || tab.id < 0 || !info.srcUrl) return;
  const settings = await loadSettings(chrome.storage).catch(() => DEFAULTS);
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
    console.debug('Upright: can\'t reach that frame:', error.message);
  }
}

export const COMMANDS = ['rotate-right', 'rotate-left', 'reset', 'open-viewer'];

/**
 * A keyboard shortcut, for the media under the pointer in the active tab: turn it, or
 * open it in the viewer at its current turn. Pressing it grants activeTab, so no host
 * permission is needed. Exported for the e2e test hook.
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

const MENU_KEYS = ['menuStyle', 'singleDirection'];

const resync = () => syncRegistration().catch((error) => console.error('Registering keys:', error));

// Listeners are registered at top level so they attach every time the service worker wakes.
// Settings live in Chrome Sync (settings.js); older installs' are moved there first, and
// anything sync refused earlier is tried again.
async function startUp() {
  await moveSettingsToSync(chrome.storage).catch((error) => console.error('Moving settings to sync:', error));
  await Promise.all([buildMenu(), resync()]);
}
chrome.runtime.onInstalled.addListener(startUp);
chrome.runtime.onStartup.addListener(startUp);
// Settings changed here, in another tab or on another computer (through Chrome Sync).
chrome.storage.onChanged.addListener((changes, area) => {
  const keys = changedSettings(changes, area);
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

// The toolbar glyph follows light and dark mode (toolbar-theme.js). Every start: Chrome shows the
// manifest's light glyph after a restart or re-enable, and closes the offscreen watcher on quit.
const toolbarTheme = createToolbarTheme({ storage: chrome.storage.local, action: chrome.action, extensionId: chrome.runtime.id });
toolbarTheme.restore();
watchFromOffscreen({ offscreen: chrome.offscreen, runtime: chrome.runtime })
  .catch((error) => console.error('Opening the colour scheme watcher:', error));
chrome.runtime.onMessage.addListener((message, sender) => {
  toolbarTheme.onMessage(message, sender);
  return false;
});
