# Chrome Web Store Listing — Upright

> Last Updated: 2026-11-09

Single source of truth for the Developer Dashboard. Update it in the same change as anything
that alters the listing, permissions, data handling or version. Not shipped: `npm run package`
zips (as `release/upright-<version>.zip`) only the contents of `extension/`.

## Store Listing

**Extension Name** [REQUIRED] (32/75)
Upright – Rotate Images & Videos
<!-- From extension/_locales/en/messages.json → extName; short_name (extShortName) is "Upright".
     "Rotate Image" was taken on the store (gamfmnmdbilcooojmbjnjpdcfcgagmib). -->

**Short Description** [REQUIRED] (from `extDescription`, 131/132)
Turn sideways images and videos upright from the right-click menu: rotate or flip them in place, or open them rotated in a new tab.

**Detailed Description** [REQUIRED] (plain text, paste as-is)

```
Found a sideways photo or phone video on a web page? Right-click it and choose Rotate image. It turns right there on the page, without reloading or moving anything around it. Click again to keep turning.

RIGHT-CLICK MENU
• One item (the default): “Rotate image” or “Rotate video” turns it a quarter turn each click, clockwise or counterclockwise as you choose.
• Or the full menu: Rotate clockwise, Rotate counterclockwise, Rotate 180°, Flip horizontally, Flip vertically, Reset, and Open in new tab.

KEYBOARD
• Point at an image or video and press Alt+Shift+R (clockwise), Alt+Shift+L (counterclockwise) or Alt+Shift+0 (reset), or Alt+Shift+V to open it in a new tab to flip and zoom. On a Mac, Alt is the Option key (⌥). Change them at chrome://extensions/shortcuts.
• Single-key mode (optional): just press R, L or 0 while pointing. Off until you switch it on, for all sites or only the ones you choose, and never while you’re typing.

IN A NEW TAB
Open any image or video full-window with rotate, flip and zoom buttons, and keys (R, Shift+R, H, V, 0). Save a rotated copy when the site allows it.

WORKS WITH
Ordinary images, responsive images and <picture> (news sites, galleries), videos, images under a gallery’s overlay, and pages that already transform their images. The page’s layout never jumps: a sideways turn shrinks to fit the same space.

PRIVACY
No account and no sign-in. Upright sends nothing anywhere and collects nothing. It only touches a page when you click its menu item or press its shortcut (or, if you switch on single-key mode, on the sites you chose). Your settings follow you to your other computers through your own Chrome Sync, like Chrome’s own settings, and never come to us. Single-key mode and its sites stay on each computer, as each one asks for its own site access.
```

**Category** [REQUIRED]
Make Chrome Yours › Accessibility (or Functionality & UI).

**Single Purpose** [REQUIRED]
Rotates and flips images and videos on web pages, in place or in a viewer tab, when the user asks.

**Primary Language** [REQUIRED]
English (also en_GB wording: "anti-clockwise").

**Homepage URL** [OPTIONAL]: an ArrayPress page for the extension, if there is one.
**Support URL** [OPTIONAL]: the support page or `mailto:` address David chooses.

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` (from `extension/icons/icon.svg`) |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `store/screenshot-1.png`: “Turn sideways photos upright, right on the page”, a post before and after Rotate image |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/screenshot-2.png`: “Hover and press ⌥⇧R (Alt+Shift+R)”, a gallery photo just turned by the shortcut |
| Screenshot 3 | 1280×800 | ✅ Ready | `store/screenshot-3.png`: “Rotate, flip and zoom in the viewer”, the viewer (light) |
| Screenshot 4 | 1280×800 | ✅ Ready | `store/screenshot-4.png`: “One menu item, or the full menu”, the settings page |
| Screenshot 5 | 1280×800 | ✅ Ready | `store/screenshot-5.png`: “Open it full-window for a closer look”, the viewer in dark mode, zoomed in |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `store/promo-440x280.png`: icon, name, “Turn sideways images upright” |
| Marquee Promo Tile [OPTIONAL] | 1400×560 | ⬜ Not made | Only used if the store features the extension |

**How they were made.** `node store/tools/make-screenshots.mjs` regenerates all six.
- It runs `scripts/build-e2e.mjs` and loads that build in Playwright's Chromium (Playwright 1.64.0 from the Tabby repo). That build is a copy of `extension/` plus the test hook.
- Chrome's right-click menu and shortcuts can't be driven headlessly, so the script calls exactly what a click on “Rotate image” or a press of ⌥⇧R / ⌥⇧L / ⌥⇧V calls, with the real pointer hovering the photo.
- Everything inside the windows is a real capture: the turned photos, the viewer and the settings page. The window frame, captions, labels, key caps and pointer are drawn.
- Chrome's own image menu isn't drawn. Shot 1 names the item in a label instead.
- The pages are made up (no real sites). Photos are CC0, from Wikimedia Commons, saved sideways in `store/tools/photos/`: “Tabby cat with blue eyes-3336579”, “Lighthouse Zadar”, “Lighthouse Chania evening sun”, “Belle Tout Lighthouse, June 2020 01”, “Lake Mountain Landscape”, “Bierstadt Lake Trail, Rocky Mountain National Park, 2009”.

## Privacy Practices

**Permission justifications**

| Permission | Justification |
|---|---|
| `activeTab` | When the user clicks a Rotate menu item or presses one of its shortcuts, grants access to that tab for that moment, so the extension can turn the media there with no host permission. |
| `contextMenus` | Adds "Rotate image" / "Rotate video" (or the "Rotate" submenu, if chosen in settings) to the right-click menu of images and videos. |
| `scripting` | Runs the code that finds the clicked or pointed-at image and sets its CSS rotation, only in the tab the user acted on. In single-key mode, also registers the key listener for the sites the user granted. |
| `storage` | `chrome.storage.sync` keeps the user's settings (menu style, direction, extra keys and the “Never on” list), so Chrome Sync carries them to the user’s other computers through their own Google account, like Chrome’s own settings (signed out of Chrome, they stay on the computer). `chrome.storage.local` keeps single-key mode, where it runs and its chosen sites, which never sync because site access is granted on each computer; and, for the moment, any settings change Chrome Sync refused, until it’s retried; and whether Chrome was last seen in light or dark mode (`toolbarDark`, one true/false, this computer only, never synced), for the toolbar icon. Nothing is sent to the developer. Nothing else is stored. No install warning. |
| `offscreen` | Keeps one small hidden page (`offscreen/offscreen.html`, reason `MATCH_MEDIA`) that reads whether Chrome is in light or dark mode (`matchMedia('(prefers-color-scheme: dark)')`, which the service worker can’t call), so the toolbar icon matches Chrome’s own icons. It only reads that one true/false and tells the extension’s service worker when it changes; it loads nothing and sends nothing anywhere. No install warning. |
| `action` (manifest key, not a permission) | The toolbar button opens the settings page. Its icon is a plain glyph in Chrome’s own toolbar icon colours, light or dark to match Chrome. |
| `commands` (manifest key) | Keyboard shortcuts for the image under the pointer: rotate (Alt+Shift+R, L), reset (Alt+Shift+0) and open in the viewer (Alt+Shift+V), changeable at chrome://extensions/shortcuts. No install warning. |
| Optional host permissions (`https://*/*`, `http://*/*`) | Asked for only when the user switches on single-key mode in settings, for all sites or the sites they list, from that click. Needed to listen for a single unmodified key (R, L, 0) on those pages, which Chrome's shortcuts can't do. The listener acts only when an image or video is under the pointer and the user isn't typing; it reads nothing else from the page. Switching the mode off gives the permissions back. |

**Web accessible resources**: `content/keys.js` and the modules it imports (`shared/page.js`, `rotate.js`, `transform.js`, `settings.js`, `sites.js`), so the single-key content script can load the same code as the menu. They're code only and contain no data; a site can tell the extension is installed by requesting them.

**Remote code**: No. Everything is in the package.

**Network requests**: None by the extension. The viewer loads the image or video the user opened, from its own address, as the page did. To offer "Save rotated copy" it loads that image once more in CORS mode (to learn whether the site allows reading its pixels); nothing is sent beyond the request for the image itself.

**Data usage** (dashboard › Privacy practices › “What user data do you plan to collect…”). Tick **none** of the boxes.
Settings sync through the user’s own Chrome Sync (their Google account), like Chrome’s own settings; the developer receives nothing. They are only the extension’s own preferences (including sites the user typed into “Never on”).

| Data type | Collected? | Notes |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | |
| Personal communications | No | |
| Location | No | |
| Web history | No | Media URLs go into the viewer tab’s own address when the user opens it, like any tab. Never stored or sent by the extension. |
| User activity | No | Single-key mode listens for R, L and 0 only over media, on sites the user chose; keys are never recorded. |
| Website content | No | The page’s media is turned with CSS in the page; nothing is read out of it or stored. A turn lives on the element (a `data-rotate-image` attribute) until the page reloads. |

Certify all three: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to decide creditworthiness or for lending.

**Privacy policy URL**: optional when nothing is collected, but worth having for reviewers,
especially with optional host permissions. Host the text below, e.g. at
`https://arraypress.com/upright/privacy`.

### Draft privacy policy

> **Upright: privacy**
>
> Upright works entirely on your computer. It collects nothing and sends nothing.
>
> **What it touches:** the image or video you right-click or point at, and only when you choose a Rotate item or press one of its shortcuts. It turns it with the page’s own styling; it doesn’t read or save the picture. If you switch on single-key mode, it listens for R, L and 0 on the sites you chose, only while you point at an image or video and aren’t typing.
>
> **What it keeps:** your settings, in Chrome’s own storage. If you’re signed in to Chrome with sync on, Chrome Sync keeps most of them in your Google account so your other computers get the same settings, as it does for Chrome’s own settings. Single-key mode and its sites stay on each computer.
>
> **Network:** Upright makes no requests of its own. The viewer shows the image or video from its usual address, as the page did. To offer “Save rotated copy”, it asks the site for the image once more.
>
> **No account, no analytics, no ads.** Settings sync is Chrome’s own, through your Google account. Nobody, including ArrayPress, receives any of your data.
>
> Questions: david@arraypress.com.

## Version History

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-11-09 | First build, not yet submitted. Settings always sync through Chrome Sync, except single-key mode and its sites (the opt-in switch is gone; earlier test installs’ settings move over by themselves). About card at the end of the settings page. |

## Submit checklist

**You need to do these yourself (they can’t be done from here):**
- [ ] **Developer account.** Register at https://chrome.google.com/webstore/devconsole (one-time US$5 fee) with the Google account that will own ArrayPress’s listings. Turn on 2-Step Verification, which the dashboard requires.
- [ ] **Account tab.** Set the publisher name (ArrayPress) and a **contact email**, and verify that email. Complete the trader / non-trader declaration (EU Digital Services Act): as a company, ArrayPress Limited is likely a trader, which needs a verified address and phone number.
- [ ] **Make the GitHub repo public** (`arraypress/upright`). The About card’s Get help, Report an issue and Privacy policy links, and the privacy policy URL (`https://github.com/arraypress/upright/blob/main/PRIVACY.md`), all point into it; while it’s private they show GitHub’s 404. `npm run package` prints a reminder.
- [ ] Decide the **support** contact (email or URL) and whether to add a homepage URL.

**Build:**
- [ ] `npm run package` (tests, then `release/upright-1.0.0.zip`; it refuses a test manifest). The zip is exactly the contents of `extension/`, less the icons' SVG sources (`test/package.test.js` checks this): `unzip -l release/upright-1.0.0.zip` lists 37 files, `manifest.json` at the root, then `_locales/` (2), `background/` (4), `content/` (2), `offscreen/` (2), `options/` (4), `viewer/` (4), `shared/` (8) and `icons/` (10 PNGs); no `store/`, `test/`, `scripts/` or `.test-builds/`.
- [ ] **No placeholder links.** `extension/options/about-links.js` points at the GitHub repo (README, Issues, PRIVACY.md); `npm run package` warns loudly if any link is ever set back to example.com.
- [ ] Load the `extension/` folder in a clean profile. Check that right-click › Rotate image, ⌥⇧R / Alt+Shift+R, the viewer and switching single-key mode on (its permission prompt) all work.

**Developer Dashboard, in order:**
1. **Items › New item**: upload `release/upright-1.0.0.zip`.
2. **Store listing**: paste the detailed description and pick the category and language (English). Upload:
   - store icon `extension/icons/icon-128.png`;
   - screenshots `store/screenshot-1.png` … `-5.png`, in that order;
   - small promo tile `store/promo-440x280.png`.

   Add the homepage and support URLs if you have them.
3. **Privacy practices**: fill in the single purpose and each justification (`activeTab`, `contextMenus`, `scripting`, `storage`, the optional host permissions). Then remote code: No, no data types ticked, the three certifications, and the privacy policy URL.
4. **Distribution**: Free; Public; all regions (or as you prefer).
5. **Test instructions** (if asked): none needed. There’s no login; right-click any image.
6. **Submit for review.** Optionally untick “Publish automatically after approval” to choose the moment.
