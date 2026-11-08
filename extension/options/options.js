import { ABOUT_LINKS } from './about-links.js';
import { ALL_SITES } from '../shared/registration.js';
import { changedSettings, loadSettings, normalizeSettings, settingsSaver } from '../shared/settings.js';
import { neverHost, originPattern, siteOrigin } from '../shared/sites.js';
import { watchColorScheme } from '../shared/toolbar-scheme.js';

const message = (name) => chrome.i18n.getMessage(name);
const $ = (id) => document.getElementById(id);

// The toolbar glyph follows this page's light or dark scheme (toolbar-theme.js).
watchColorScheme().catch((error) => console.debug('Reporting the colour scheme:', error));

for (const el of document.querySelectorAll('[data-i18n]')) {
  const text = message(el.dataset.i18n);
  if (text) el.textContent = text;
}
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = message(el.dataset.i18nPlaceholder);
document.title = message('optionsTitle');

const store = chrome.storage;
let settings = await loadSettings(store);
// Changes show at once and are written once the clicks stop (Chrome Sync allows 120 writes a minute).
const saver = settingsSaver(store, { onSaved: () => flash(message('optionsSaved')) });

let statusTimer;
function flash(text) {
  $('status').textContent = text;
  $('status').classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => $('status').classList.remove('show'), 2500);
}

function save(changes) {
  settings = normalizeSettings({ ...settings, ...changes });
  saver.save(changes);
  show();
}

function siteList(list, items, onRemove) {
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.className = 'row';
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = item.replace(/^https:\/\//, '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = message('optionsRemove');
    remove.addEventListener('click', () => onRemove(item));
    li.append(name, remove);
    return li;
  }));
}

function show() {
  for (const radio of document.querySelectorAll('input[name="menuStyle"]')) radio.checked = radio.value === settings.menuStyle;
  $('singleDirection').value = settings.singleDirection;
  $('singleDirection').disabled = settings.menuStyle !== 'single';
  $('direction-row').classList.toggle('off', $('singleDirection').disabled);

  $('singleKey').checked = settings.singleKey;
  $('singleKeyScope').value = settings.singleKeyScope;
  $('extraKeys').checked = settings.extraKeys;
  for (const row of document.querySelectorAll('[data-needs-keys]')) row.hidden = !settings.singleKey;
  $('chosen-row').hidden = !settings.singleKey || settings.singleKeyScope !== 'chosen';
  siteList($('singleKeySites'), settings.singleKeySites, removeSite);
  siteList($('neverSites'), settings.neverSites, (host) => save({ neverSites: settings.neverSites.filter((h) => h !== host) }));
}

// --- Permissions: asked for from the click itself, as Chrome requires; nothing at install. ---

/** The host patterns single-key mode needs for `scope`. */
const patternsFor = (scope, sites = settings.singleKeySites) =>
  scope === 'all' ? [...ALL_SITES] : sites.map(originPattern);

/** Give back every optional host permission not in `keep`. */
async function releaseExcept(keep = []) {
  const { origins = [] } = await chrome.permissions.getAll();
  const release = origins.filter((origin) => !keep.includes(origin));
  if (release.length) await chrome.permissions.remove({ origins: release }).catch(() => {});
}

/** permissions.request, called synchronously from a click. Empty asks for nothing. */
const request = (origins) => (origins.length ? chrome.permissions.request({ origins }) : Promise.resolve(true));

$('singleKey').addEventListener('change', async (event) => {
  if (event.target.checked) {
    if (!(await request(patternsFor(settings.singleKeyScope)))) {
      event.target.checked = false;
      return flash(message('optionsDenied'));
    }
    save({ singleKey: true });
  } else {
    save({ singleKey: false });
    await releaseExcept();
  }
});

$('singleKeyScope').addEventListener('change', async (event) => {
  const scope = event.target.value;
  if (!(await request(patternsFor(scope)))) {
    event.target.value = settings.singleKeyScope;
    return flash(message('optionsDenied'));
  }
  save({ singleKeyScope: scope });
  await releaseExcept(patternsFor(scope));
});

$('add-site').addEventListener('submit', async (event) => {
  event.preventDefault();
  const origin = siteOrigin($('site-input').value);
  if (!origin) return;
  if (!(await request([originPattern(origin)]))) return flash(message('optionsDenied'));
  $('site-input').value = '';
  save({ singleKeySites: [...settings.singleKeySites, origin] });
});

async function removeSite(origin) {
  save({ singleKeySites: settings.singleKeySites.filter((o) => o !== origin) });
  await releaseExcept(patternsFor(settings.singleKeyScope));
}

$('add-never').addEventListener('submit', async (event) => {
  event.preventDefault();
  const host = neverHost($('never-input').value);
  if (!host) return;
  $('never-input').value = '';
  save({ neverSites: [...settings.neverSites, host] });
});

$('extraKeys').addEventListener('change', (event) => save({ extraKeys: event.target.checked }));
for (const radio of document.querySelectorAll('input[name="menuStyle"]')) {
  radio.addEventListener('change', () => save({ menuStyle: radio.value }));
}
$('singleDirection').addEventListener('change', (event) => save({ singleDirection: event.target.value }));

// Settings can change without this page: from another computer, through sync, or in another tab.
// Changes made here and not yet written stay on top.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (!changedSettings(changes, area).length) return;
  settings = normalizeSettings({ ...(await loadSettings(store)), ...saver.pending });
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
const commands = (await chrome.commands.getAll()).filter((c) => ORDER.includes(c.name))
  .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
// Only the shortcuts that are set; the link row below goes to Chrome's page to change them.
const set = commands.filter((command) => command.shortcut);
$('shortcuts').replaceChildren(...set.map((command) => {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = command.description;
  const keys = document.createElement('span');
  keys.className = 'row-value';
  keys.textContent = command.shortcut;
  row.append(label, keys);
  return row;
}));
$('no-shortcuts').hidden = set.length > 0;
// The one-item hint names the shortcuts as they're set now (people change them).
const keyFor = (name) => commands.find((c) => c.name === name)?.shortcut || message('optionsShortcutNotSet');
$('single-hint').textContent = chrome.i18n.getMessage('optionsSingleHint', [keyFor('open-viewer'), keyFor('reset')]);
// chrome:// pages can't be opened from a link on an extension page.
$('edit-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// About card: the version Chrome loaded, and the links from about-links.js.
$('version').textContent = chrome.i18n.getMessage('optionsVersion', [chrome.runtime.getManifest().version]);
$('help').href = ABOUT_LINKS.help;
$('report-issue').href = ABOUT_LINKS.reportIssue;
$('privacy-policy').href = ABOUT_LINKS.privacyPolicy;

show();
