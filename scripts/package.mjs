/**
 * Zip the extension for the Chrome Web Store: release/upright-<version>.zip. The zip is exactly
 * the contents of extension/ (manifest.json at its root), less the source-only files in EXCLUDE.
 * Run through `npm run package`, which runs the tests first.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkKitCopy } from './kit.mjs';
import { placeholderWarning, repositoryReminder } from './warn-placeholder-links.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const EXTENSION = path.join(root, 'extension');

/**
 * zip -x patterns (a `*` crosses folders): the icons' SVG sources (scripts/icons.mjs and
 * scripts/toolbar-icons.mjs render the PNGs that ship) and Finder's .DS_Store files.
 */
export const EXCLUDE = ['icons/*.svg', '*.DS_Store'];

/** Zip everything under `from` into `to`, paths relative to `from`. */
export async function zipExtension(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await rm(to, { force: true });
  // -X leaves out macOS extended attributes (the store rejects __MACOSX entries); -D leaves out
  // folder entries, so the zip lists files only.
  execFileSync('zip', ['-r', '-X', '-D', '-q', to, '.', '-x', ...EXCLUDE], { cwd: from, stdio: 'inherit' });
  return to;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // chrome-ui.css is the shared kit's copy (../_chrome-ui); stop if it's out of date.
  await checkKitCopy(path.join(EXTENSION, 'shared', 'chrome-ui.css'));
  const manifest = JSON.parse(await readFile(path.join(EXTENSION, 'manifest.json'), 'utf8'));

  // The store build asks for no sites; only the e2e build does.
  if (manifest.host_permissions || manifest.background.service_worker !== 'background/background.js') {
    console.error('manifest.json looks like a test build (host_permissions or a test hook). Not packaging.');
    process.exit(1);
  }

  const zip = await zipExtension(EXTENSION, path.join(root, 'release', `upright-${manifest.version}.zip`));
  console.log(`Packaged ${path.relative(root, zip)}`);
  // Last, so it's the thing on screen: the About links mustn't ship as placeholders.
  const warning = placeholderWarning();
  if (warning) console.warn(`\n${warning}\n`);
  const reminder = repositoryReminder();
  if (reminder) console.log(`\n${reminder}\n`);
}
