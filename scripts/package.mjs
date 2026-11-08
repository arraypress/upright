/**
 * Zip the extension for the Chrome Web Store: release/upright-<version>.zip,
 * exactly the contents of extension/ (manifest.json at its root) less the
 * source-only files (@arraypress/extension-kit `ZIP_EXCLUDE`: icon SVG
 * sources, type declarations, .DS_Store). Run through `npm run package`,
 * which runs the tests first; the About links' reminders print last.
 *
 * @module scripts/package
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { printReleaseChecks, zipExtension } from '@arraypress/extension-kit/build';
import { ABOUT_LINKS, REPOSITORY } from '../extension/options/about-links.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extension = path.join(root, 'extension');
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));

// The store build asks for no sites; only the e2e build (scripts/build-e2e.mjs) does.
if (manifest.host_permissions || manifest.background.service_worker !== 'background/background.js') {
  console.error('manifest.json looks like a test build (host_permissions or a test hook). Not packaging.');
  process.exit(1);
}

const zip = await zipExtension(extension, path.join(root, 'release', `upright-${manifest.version}.zip`));
console.log(`Packaged ${path.relative(root, zip)}`);
printReleaseChecks(ABOUT_LINKS, REPOSITORY);
