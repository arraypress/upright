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
  byId, createSettingsSaver, createSiteList, originPattern, setAboutLinks, setShortcuts, setUpPage, siteHost, siteOrigin,
  statusFlasher, valueRow,
} from '../vendor/extension-kit/index.js';
import { ABOUT_LINKS } from './about-links.js';
import { ALL_SITES } from '../shared/registration.js';
import { normalizeSettings, settingsStore } from '../shared/settings.js';

/** @import { Settings } from '../shared/settings.js' */

const t = setUpPage(chrome, { title: 'optionsTitle' });
const singleDirection = byId('singleDirection', HTMLSelectElement);
const singleKey = byId('singleKey', HTMLInputElement);
const singleKeyScope = byId('singleKeyScope', HTMLSelectElement);
const extraKeys = byId('extraKeys', HTMLInputElement);
const menuStyles = [...document.querySelectorAll('input[name="menuStyle"]')].filter((input) => input instanceof HTMLInputElement);

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
  chosenSites.render(settings.singleKeySites);
  neverSites.render(settings.neverSites);
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

/**
 * Ask Chrome for a site's access, from the click itself; refused, say so.
 *
 * @param {string} origin - The site.
 * @returns {Promise<boolean>} Whether it's granted.
 */
async function askAccess(origin) {
  const granted = await request([originPattern(origin)]);
  if (!granted) flash(t('optionsDenied'));
  return granted;
}

/**
 * The site lists' words, translated. Both lists are as chrome://settings/performance lists the
 * sites Memory Saver keeps active: “Add” asks for a site in the one-field dialog, each row has a ⋮
 * menu (Edit, Remove), and “No sites added” shows while there are none. A site added again moves
 * to the end, once.
 */
const words = {
  add: t('optionsAdd'), addSite: t('optionsAddSite'), editSite: t('optionsEditSite'), edit: t('optionsEdit'),
  remove: t('optionsRemove'), save: t('optionsSave'), cancel: t('optionsCancel'), site: t('optionsSiteLabel'),
  invalid: t('optionsSiteInvalid'), moreActions: (/** @type {string} */ site) => t('optionsMoreActions', [site]),
};

// The chosen sites (origins): each needs its site access, asked for from the dialog's click, and
// given back when it's removed or edited away.
const chosenSites = createSiteList({
  list: byId('singleKeySites'),
  empty: byId('no-chosen-sites'),
  addButton: byId('add-site'),
  parse: siteOrigin,
  async add(origin) {
    if (await askAccess(origin)) save({ singleKeySites: [...settings.singleKeySites.filter((o) => o !== origin), origin] });
  },
  // Stop single-key mode on the site, and give its access back.
  async remove(origin) {
    save({ singleKeySites: settings.singleKeySites.filter((o) => o !== origin) });
    await releaseExcept(patternsFor(settings.singleKeyScope));
  },
  async replace(origin, edited) {
    if (!(await askAccess(edited))) return;
    save({ singleKeySites: [...new Set(settings.singleKeySites.map((o) => (o === origin ? edited : o)))] });
    await releaseExcept(patternsFor(settings.singleKeyScope));
  },
  words,
});

// “Never on” (hosts): no access needed.
const neverSites = createSiteList({
  list: byId('neverSites'),
  empty: byId('no-never-sites'),
  addButton: byId('add-never'),
  parse: siteHost,
  add: (host) => save({ neverSites: [...settings.neverSites.filter((h) => h !== host), host] }),
  remove: (host) => save({ neverSites: settings.neverSites.filter((h) => h !== host) }),
  replace: (host, edited) => save({ neverSites: [...new Set(settings.neverSites.map((h) => (h === host ? edited : h)))] }),
  words,
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
