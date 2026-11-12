# Changelog

## 1.0.0 — unreleased

First version.

- Right-click “Rotate image” / “Rotate video” (one item, a quarter turn per click), or the full
  Rotate menu: clockwise, counterclockwise, 180°, flips, reset, open in a new tab.
- Shortcuts for the media under the pointer: Alt+Shift+R / L / 0 / V.
- Optional single-key mode (R, L, 0) on chosen sites.
- Viewer with rotate, flip, zoom and “Save rotated copy” where the site allows it.
- Settings sync through Chrome Sync; settings page styled like chrome://settings, with an About card.
- Toolbar icon drawn in Chrome’s own icon colours, light and dark.

Fixed before release (a review of the whole extension):

- Two turns in quick succession (a shortcut pressed twice) build up: turns in a tab now run one
  after another. The second used to measure the media before the first had turned it, and one
  of the two was lost.
- In single-key mode, R, L or 0 pressed over nothing no longer walks the whole page looking for
  media: the pointer's place is looked at first.
- The right-click menu is built by the kit's `contextMenuBuilder` (extension kit 1.11.0).
- A chosen site whose access Chrome refused keeps what was typed in the dialog.
