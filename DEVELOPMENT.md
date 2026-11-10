# Upright: development notes

How Upright works inside, for whoever changes it next. The user-facing overview is in [README.md](README.md).

## What it does
- **Right-click menu** (Options › Right-click menu):
  - *One item* (default): "Rotate image" / "Rotate video". Each click is a quarter turn, clockwise or counterclockwise as set.
  - *Full menu*: "Rotate ▸" clockwise, counterclockwise, 180°, flip horizontally, flip vertically, Reset, Open in new tab.
- **Shortcuts** for whatever is under the pointer: Alt+Shift+R (clockwise), Alt+Shift+L (counterclockwise), Alt+Shift+0 (reset), Alt+Shift+V (open in the viewer at its current turn). Change them at chrome://extensions/shortcuts. With the one-item menu, Alt+Shift+V and Alt+Shift+0 are the way to the viewer's flips and zoom, and to Reset.
- **Single-key mode** (opt-in, asks for site access): R, L and 0 over media, with H/V flips as "extra keys". Never in text fields; a key that turns nothing goes to the page as normal.
- **Viewer** (`viewer/viewer.html?src=…&r=90&f=1`): full window, rotate/flip/zoom buttons and keys R, Shift-R, H, V, 0, +/−, F, 1. CSS only, so any site's media shows. "Save rotated copy" is offered only when the site allows reading the pixels (CORS).

## How it turns things
- CSS `rotate`, `scale` and `translate` properties on the element, which draw on top of the page's own `transform` without replacing it. Layout never moves; a sideways turn shrinks the media to fit its box (scale = min(w/h, h/w)), centred.
- The page's own `translate`/`rotate`/`scale` (e.g. Tailwind v4 centring) are folded in, and put back on Reset.
- State lives in the element's `data-rotate-image` attribute, so turns build up.
- Finding the right-clicked media: `currentSrc` first, then `src`/srcset/`<picture>`/`<source>`/`data-src*`, then the same file in another size or format (CDN variants).
- No host permissions for the menu or shortcuts: a click or shortcut grants `activeTab`.

## Files
The extension is `extension/`: load that folder, and `npm run package` zips exactly its contents (less the icons' SVG sources and `.DS_Store`; `test/package.test.js` checks it). Paths here are inside it. A file's folder is where it runs: `background/` only in the service worker, `content/` only in web pages (single-key mode), `offscreen/`, `options/` and `viewer/` are those pages, and `shared/` is loaded by more than one of them.
- `shared/transform.js`: the maths (state, fit, composing with the page). Pure.
- `shared/page.js`: the functions run in the page (find, measure, apply). Self-contained.
- `shared/rotate.js`: the two round trips, and viewer URLs (the worker, the viewer and single-key mode). `background/menu.js`, `shared/registration.js` (the worker, and the options page's site list). Sites (typed origins and hosts, their patterns) and the options page's site lists are the kit's (`siteOrigin`, `siteHost`, `hostPatterns`, `createSiteList`).
- `shared/settings.js`: the schema (defaults, normaliser, per-computer keys) for `@arraypress/extension-kit`'s settings store. Settings live in Chrome Sync (`chrome.storage.sync`, one item each), like Chrome's own; plain preferences, and the developer receives nothing. Single-key mode, its scope and its sites stay in `chrome.storage.local`: they need site access, granted on each computer. A write sync refuses is kept in local and retried (by the options page, and by the worker at start); the options page debounces its writes (sync allows 120 a minute). `keys.js` imports it, so it takes the kit's store module directly and both store files are web accessible.
- `options/about-links.js`: the About card's help, “Report an issue” and privacy links (`githubAboutLinks`), all pointing into the GitHub repo (README, Issues, PRIVACY.md). `npm run package` reminds you the repo must be public before the store listing goes live, and warns loudly if a link is ever an example.com placeholder.
- The toolbar glyph: the toolbar button (opens settings) shows a light/dark glyph (`icons/toolbar/`, `npm run toolbar-icons`). The kit does the work: `startToolbarTheme(chrome)` in the worker, `setUpPage(chrome)` (which reports the scheme) on the options page and the viewer, `watchSchemeOffscreen` in `offscreen/` (kept open, reason MATCH_MEDIA, polling: offscreen pages get no `change` events); key `toolbarDark` in local, never synced.
- `vendor/extension-kit/`: `@arraypress/extension-kit`'s browser half, copied in from `node_modules` by `npm install` (its `postinstall`) and never committed, so it can't drift from the version in `package.json`; `npm test` starts with `extension-kit vendor-check`, which fails while the copy isn't the installed version (`npm install <package>` doesn't rerun `postinstall`: run `npm run postinstall`). Don't edit it; change the library.
- `background/background.js`: wiring. `content/keys-loader.js` (the registered content script) + `content/keys.js`: single-key mode; `keys.js` and what it imports are `web_accessible_resources` so the content script can load them. `viewer/`, `options/`.

## Limits
- CSS background images, `<canvas>`, SVG `<image>` and media in closed shadow roots can't be turned in place.
- Frames from another site: activeTab covers the tab's own site, so nothing happens there (the viewer still works via "Open in new tab").
- Video controls turn with the video (sideways after a quarter turn) but stay clickable. Fullscreen video drops the turn.
- A page's 3D transform isn't composed; the turn applies about the transform origin on its own.
- A later layout change (e.g. responsive resize with a different aspect) keeps the fit from when it was turned.
- `blob:` media (most streaming sites) can't open in the viewer.
- YouTube uses L and 0 itself while you point at its player: add youtube.com to "Never on" if that matters.

## Develop
- `npm install` first: it also copies the kit into `extension/vendor/`.
- `npm test`: lints (ESLint), type-checks the JSDoc-typed JavaScript (`tsc`, strict; nothing is emitted), runs the unit tests (vitest) and checks for copied code (`extension-kit duplication`: move shared code into a function, or list a deliberate copy in `.jscpd-allowlist.json` with a reason). Each on its own: `npm run lint`, `npm run typecheck`, `npm run duplication`.
- `npm run test:e2e`: builds the hidden `.test-builds/e2e/` (or `$EXTENSION_TEST_BUILDS/e2e/`) from `extension/` (adds a test hook, 127.0.0.1 access and webNavigation) and drives it in Playwright's Chromium. `ROTATE_SHOTS=dir` saves screenshots.
- `npm run package`: tests, then `release/upright-<version>.zip` for the store (less SVG sources, `.d.ts` and `.DS_Store`). Refuses a test manifest; warns while `extension/options/about-links.js` has placeholders.
- `npm run icons`: re-render `extension/icons/*.png` from `extension/icons/icon.svg`.
- `node store/tools/make-screenshots.mjs`: re-make the store screenshots and promo tile in `store/` (not packaged; listing text in `CHROMEWEBSTORE.md`).

## Design
- The options page copies chrome://settings; the viewer's bar uses the same tokens and icon buttons.
- The look comes from `chrome-ui.css` in `@arraypress/extension-kit` (`extension/vendor/extension-kit/styles/`).
  Class names are in the kit's README.
- Never hand-roll styles for what the kit has (rows, cards, toggles, selects, buttons, link rows, menus,
  dialogs). `options/options.css` / `viewer/viewer.css` hold only what those pages add.
- One card per section, titles above cards, help as a row's secondary text, Chrome pages as link rows.
- The About card comes last and copies chrome://settings/help (Chromium's `settings/about_page`): logo and name, “Version …”, then “Get help with Upright”, “Report an issue”, “Privacy policy” as external link rows (the kit's `.about-product` and `.product-title`).

## Wording (match Chrome's own menus)
The same rules as Tabby's (`../tabby/CLAUDE.md`, "Wording") and More Tab Actions:
- Copy how Chrome words the equivalent (its context menus, chrome://extensions, chrome://settings, the app menu); don't invent. "Save image as…" and "Open image in new tab" are Chrome's, so ours are "Rotate", "Open in new tab", "Reset".
- "…" only when the item opens something that asks for more input; never on items that act at once ("Save rotated copy" downloads straight away, so no "…").
- Sentence case everywhere ("Rotate image", "Keyboard shortcuts"); the store name "Upright – Rotate Images & Videos" is the one exception.
- Curly quotes and apostrophes (“ ” ’) and "…" (U+2026); no exclamation marks.
- The options page is the extension's only page, so it keeps its name in the title: "Upright settings" (Tabby, with several pages, calls its own just "Settings").
- The name is in one place, `extShortName` (and the store name, `extName`): other messages take it as `$NAME$` (content `$1`), which the kit's `t` and `data-i18n` fill in. The toolbar button's tooltip is just the name (`__MSG_extShortName__`), as the manifest can't fill a placeholder.
- `en_GB` overrides only the words that differ ("anti-clockwise"); change it in step with `en`.
