/**
 * Build .test-builds/e2e/: the extension plus two things the store build never has.
 *
 * - A test hook: the service worker entry becomes e2e-hook.js, which exposes the menu's
 *   click handler, because Chrome's native context menu can't be clicked headlessly.
 * - host_permissions for http://127.0.0.1: a real menu click grants activeTab, a test's
 *   call doesn't. localhost is left out on purpose, to stand in for a site we can't reach.
 * - webNavigation, so the test can look up frame ids as Chrome's menu would pass them.
 *
 * scripts/package.mjs refuses a manifest with host_permissions.
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FILES } from './files.mjs';
import { checkKitCopy } from './kit.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// chrome-ui.css is the shared kit's copy (../_chrome-ui); stop if it's out of date.
await checkKitCopy(path.join(root, 'chrome-ui.css'));
// Hidden from Finder: load the extension folder itself, not this.
const out = path.join(root, '.test-builds', 'e2e');

await rm(out, { recursive: true, force: true });
for (const file of FILES) await cp(path.join(root, file), path.join(out, file), { recursive: true });
await cp(path.join(root, 'test/e2e/hook.js'), path.join(out, 'e2e-hook.js'));

const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
manifest.background.service_worker = 'e2e-hook.js';
manifest.host_permissions = ['http://127.0.0.1/*'];
manifest.permissions.push('webNavigation');
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Built .test-builds/e2e/');
