/**
 * Real-browser check of the toolbar glyph: loads the e2e build (.test-builds/e2e, made by
 * scripts/build-e2e.mjs) in Playwright's Chromium and runs @arraypress/extension-kit's
 * `checkToolbarTheme`: the offscreen watcher opens once for MATCH_MEDIA, the options page and the
 * viewer swap the glyph dark and light, and the offscreen document alone follows a change with no
 * page open.
 *
 *   npm run test:e2e
 *
 * @module test/e2e/toolbar
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { checkToolbarTheme, launchExtension } from '@arraypress/extension-kit/testing';
import { toolbarIcon } from '../../extension/vendor/extension-kit/index.js';

const build = fileURLToPath(new URL('../../.test-builds/e2e', import.meta.url));
const launched = await launchExtension(chromium, build, { prefix: 'upright-toolbar-' });
try {
  await checkToolbarTheme(launched, [{ path: 'options/options.html' }, { path: 'viewer/viewer.html' }], {
    light: toolbarIcon(false),
    dark: toolbarIcon(true),
  });
} finally {
  await launched.close();
}
