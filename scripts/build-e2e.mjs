/**
 * Build .test-builds/e2e/ (or under $EXTENSION_TEST_BUILDS): a copy of extension/ plus three
 * things the store build never has.
 *
 * - A test hook: the service worker entry becomes e2e-hook.js, which exposes the menu's
 *   click handler, because Chrome's native context menu can't be clicked headlessly.
 * - host_permissions for http://127.0.0.1: a real menu click grants activeTab, a test's
 *   call doesn't. localhost is left out on purpose, to stand in for a site we can't reach.
 * - webNavigation, so the test can look up frame ids as Chrome's menu would pass them.
 *
 * scripts/package.mjs refuses a manifest with host_permissions.
 *
 * @module scripts/build-e2e
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTestCopy, testBuildDir } from '@arraypress/extension-kit/build';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const out = await buildTestCopy({
  from: path.join(root, 'extension'),
  to: testBuildDir(root),
  hook: path.join(root, 'test/e2e/hook.js'),
  manifest: (manifest) => {
    manifest.host_permissions = ['http://127.0.0.1/*'];
    manifest.permissions?.push('webNavigation');
  },
});
console.log(`Built ${path.relative(root, out)}/`);
