/**
 * Zip the extension for the Chrome Web Store: release/upright-<version>.zip.
 * Run through `npm run package`, which runs the tests first.
 */
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FILES } from './files.mjs';
import { checkKitCopy } from './kit.mjs';
import { placeholderWarning, repositoryReminder } from './warn-placeholder-links.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// chrome-ui.css is the shared kit's copy (../_chrome-ui); stop if it's out of date.
await checkKitCopy(path.join(root, 'chrome-ui.css'));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

// The store build asks for no sites; only the e2e build does.
if (manifest.host_permissions || manifest.background.service_worker !== 'background.js') {
  console.error('manifest.json looks like a test build (host_permissions or a test hook). Not packaging.');
  process.exit(1);
}
for (const file of FILES) await access(path.join(root, file));

const zip = path.join(root, 'release', `upright-${manifest.version}.zip`);
await mkdir(path.dirname(zip), { recursive: true });
await rm(zip, { force: true });
// -X leaves out macOS extended attributes; the store rejects __MACOSX entries.
execFileSync('zip', ['-r', '-X', zip, ...FILES, '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log(`Packaged ${path.relative(root, zip)}`);
// Last, so it's the thing on screen: the About links mustn't ship as placeholders.
const warning = placeholderWarning();
if (warning) console.warn(`\n${warning}\n`);
const reminder = repositoryReminder();
if (reminder) console.log(`\n${reminder}\n`);
