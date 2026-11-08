/**
 * The options page: the right-click menu's style, keyboard shortcuts,
 * single-key mode (with the site access it needs, asked for from the click
 * itself), sites it never runs on, and the About card. Changes show at once
 * and are written once the clicks stop (Chrome Sync allows 120 writes a
 * minute).
 *
 * @module options/options
 */

import {
  byId, createSettingsSaver, localize, setAboutLinks, setShortcuts, statusFlasher, translator, valueRow, watchColorScheme,
} from '../vendor/extension-kit/index.js';
import { ABOUT_LINKS } from './about-links.js';
import { ALL_SITES } from '../shared/registration.js';
import { normalizeSettings, settingsStore } from '../shared/settings.js';
import { neverHost, originPattern, siteOrigin } from '../shared/sites.js';

/** @import { Settings } from '../shared/settings.js' */

const t = translator(chrome.i18n);
const singleDirection = byId('singleDirection', HTMLSelectElement);
const singleKey = byId('singleKey', HTMLInputElement);
const singleKeyScope = byId('singleKeyScope', HTMLSelectElement);
const extraKeys = byId('extraKeys', HTMLInputElement);
const siteInput = byId('site-input', HTMLInputElement);
const neverInput = byId('never-input', HTMLInputElement);
const menuStyles = [...document.querySelectorAll('input[name="menuStyle"]')].filter((input) => input instanceof HTMLInputElement);

// The toolbar glyph follows this page's light or dark scheme.
watchColorScheme(chrome).catch((error) => console.debug('Reporting the colour scheme:', error));

localize(document, chrome.i18n);
document.title = t('optionsTitle');

let settings = await settingsStore.load(chrome.storage);
const flash = statusFlasher(byId('status'), 2500);
const saver = createSettingsSaver(settingsStore, chrome.storage, { onSaved: () => flash(t('optionsSaved')) });

/**
 * Apply `changes` here at once, and queue them for storage.
 *
 * @param {Partial<Record<keyof Settings, unknown>>} changes - Raw values; normalised on the way.
 */
function save(changes) {
  settings = normalizeSettings({ ...settings, ...changes });
  saver.save(/** @type {Partial<Settings>} */ (changes));
  show();
}

/**
 * Fill a list of sites, each with a Remove button.
 *
 * @param {HTMLElement} list - The `<ul class="list">`.
 * @param {readonly string[]} items - Origins or hosts.
 * @param {(item: string) => void} onRemove - Called with the item whose Remove was clicked.
 */
function siteList(list, items, onRemove) {
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.className = 'row';
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = item.replace(/^https:\/\//, '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('optionsRemove');
    remove.addEventListener('click', () => onRemove(item));
    li.append(name, remove);
    return li;
  }));
}

/** Show `settings`: every control, and the rows that only make sense with single-key mode on. */
function show() {
  for (const radio of menuStyles) radio.checked = radio.value === settings.menuStyle;
  singleDirection.value = settings.singleDirection;
  singleDirection.disabled = settings.menuStyle !== 'single';
  byId('direction-row').classList.toggle('off', singleDirection.disabled);

  singleKey.checked = settings.singleKey;
  singleKeyScope.value = settings.singleKeyScope;
  extraKeys.checked = settings.extraKeys;
  for (const row of document.querySelectorAll('[data-needs-keys]')) if (row instanceof HTMLElement) row.hidden = !settings.singleKey;
  byId('chosen-row').hidden = !settings.singleKey || settings.singleKeyScope !== 'chosen';
  siteList(byId('singleKeySites'), settings.singleKeySites, removeSite);
  siteList(byId('neverSites'), settings.neverSites, (host) => save({ neverSites: settings.neverSites.filter((h) => h !== host) }));
}

// --- Permissions: asked for from the click itself, as Chrome requires; nothing at install. ---

/**
 * The host patterns single-key mode needs.
 *
 * @param {Settings['singleKeyScope']} scope - All sites, or the chosen ones.
 * @param {readonly string[]} [sites] - The chosen origins. Default the current ones.
 * @returns {string[]} Match patterns.
 */
const patternsFor = (scope, sites = settings.singleKeySites) =>
  scope === 'all' ? [...ALL_SITES] : sites.map(originPattern);

/**
 * Give back every optional host permission not in `keep`.
 *
 * @param {readonly string[]} [keep] - Patterns to hold on to.
 */
async function releaseExcept(keep = []) {
  const { origins = [] } = await chrome.permissions.getAll();
  const release = origins.filter((origin) => !keep.includes(origin));
  if (release.length) await chrome.permissions.remove({ origins: release }).catch(() => {});
}

/**
 * `permissions.request`, called synchronously from a click. Empty asks for nothing.
 *
 * @param {string[]} origins - Match patterns.
 * @returns {Promise<boolean>} Whether they're granted.
 */
const request = (origins) => (origins.length ? chrome.permissions.request({ origins }) : Promise.resolve(true));

singleKey.addEventListener('change', async () => {
  if (!singleKey.checked) {
    save({ singleKey: false });
    await releaseExcept();
    return;
  }
  if (!(await request(patternsFor(settings.singleKeyScope)))) {
    singleKey.checked = false;
    flash(t('optionsDenied'));
    return;
  }
  save({ singleKey: true });
});

singleKeyScope.addEventListener('change', async () => {
  const scope = singleKeyScope.value === 'chosen' ? 'chosen' : 'all';
  if (!(await request(patternsFor(scope)))) {
    singleKeyScope.value = settings.singleKeyScope;
    flash(t('optionsDenied'));
    return;
  }
  save({ singleKeyScope: scope });
  await releaseExcept(patternsFor(scope));
});

byId('add-site').addEventListener('submit', async (event) => {
  event.preventDefault();
  const origin = siteOrigin(siteInput.value);
  if (!origin) return;
  if (!(await request([originPattern(origin)]))) {
    flash(t('optionsDenied'));
    return;
  }
  siteInput.value = '';
  save({ singleKeySites: [...settings.singleKeySites, origin] });
});

/**
 * Stop single-key mode on a chosen site, and give its access back.
 *
 * @param {string} origin - The site's origin.
 */
async function removeSite(origin) {
  save({ singleKeySites: settings.singleKeySites.filter((o) => o !== origin) });
  await releaseExcept(patternsFor(settings.singleKeyScope));
}

byId('add-never').addEventListener('submit', (event) => {
  event.preventDefault();
  const host = neverHost(neverInput.value);
  if (!host) return;
  neverInput.value = '';
  save({ neverSites: [...settings.neverSites, host] });
});

extraKeys.addEventListener('change', () => save({ extraKeys: extraKeys.checked }));
for (const radio of menuStyles) radio.addEventListener('change', () => save({ menuStyle: radio.value }));
singleDirection.addEventListener('change', () => save({ singleDirection: singleDirection.value }));

// Settings can change without this page: from another computer, through sync, or in another tab.
// Changes made here and not yet written stay on top.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (!settingsStore.changed(changes, area).length) return;
  settings = normalizeSettings({ ...(await settingsStore.load(chrome.storage)), ...saver.pending });
  show();
});
// Leaving the page writes any change still waiting.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saver.flush();
});
addEventListener('pagehide', () => saver.flush());

// --- Shortcuts: Chrome owns them; we list them and link to its page. ---

// In the manifest's order (clockwise, counterclockwise, reset), not Chrome's.
const ORDER = ['rotate-right', 'rotate-left', 'reset', 'open-viewer'];
const commands = await chrome.commands.getAll();
const shortcuts = setShortcuts(
  ORDER.map((id) => ({ id, title: commands.find((command) => command.name === id)?.description ?? id })),
  commands,
);
// Only the shortcuts that are set; the link row below goes to Chrome's page to change them.
byId('shortcuts').replaceChildren(...shortcuts.map(({ title, shortcut }) => valueRow(title, shortcut)));
byId('no-shortcuts').hidden = shortcuts.length > 0;
/**
 * A command's shortcut as it's set now (people change them), or "not set".
 *
 * @param {string} name - The command.
 * @returns {string} Its keys.
 */
const keyFor = (name) => commands.find((command) => command.name === name)?.shortcut || t('optionsShortcutNotSet');
// The one-item hint names the shortcuts.
byId('single-hint').textContent = t('optionsSingleHint', [keyFor('open-viewer'), keyFor('reset')]);
// chrome:// pages can't be opened from a link on an extension page.
byId('edit-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// About card: the version Chrome loaded, and the links from about-links.js.
byId('version').textContent = t('optionsVersion', [chrome.runtime.getManifest().version]);
setAboutLinks(ABOUT_LINKS);

show();
