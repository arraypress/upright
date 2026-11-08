/**
 * Render the toolbar glyph (extension/icons/toolbar/glyph.svg, and glyph-16.svg fitted to whole pixels)
 * into light-/dark-16/32/48.png in Chrome's toolbar icon colours. Run by hand after editing a
 * source: `node scripts/toolbar-icons.mjs`.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { fileURLToPath as toPath } from 'node:url';

// The renderer lives in the shared design kit (../_chrome-ui), outside this repo; the PNGs it
// makes are committed, so a standalone clone doesn't need it.
const kit = new URL('../../_chrome-ui/toolbar-icons.mjs', import.meta.url);
if (!existsSync(toPath(kit))) {
  console.error('The toolbar icons are drawn by the shared design kit (../_chrome-ui), which isn’t next to this repo. The committed PNGs in extension/icons/toolbar/ are current.');
  process.exit(1);
}
const { renderToolbarIcons } = await import(kit.href);

const dir = fileURLToPath(new URL('../extension/icons/toolbar/', import.meta.url));
for (const file of await renderToolbarIcons({ chromium, dir })) console.log(`wrote ${file}`);
