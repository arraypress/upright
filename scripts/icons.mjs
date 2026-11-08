/** Render extension/icons/icon.svg to the PNG sizes the manifest lists. Run by hand after editing the SVG. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const icons = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'extension', 'icons');
const svg = await readFile(path.join(icons, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(icons, `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
