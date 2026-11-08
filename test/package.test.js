import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXTENSION, zipExtension } from '../scripts/package.mjs';
import { SCRIPT_FILE } from '../extension/shared/registration.js';
import { OFFSCREEN_PATH } from '../extension/background/toolbar-theme.js';

const extension = fileURLToPath(new URL('../extension/', import.meta.url));

/** Every file under `dir`, as paths relative to it with forward slashes. */
async function filesUnder(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** What ships: everything but the icons' SVG sources and Finder's .DS_Store files. */
const ships = (file) => !/^icons\/.*\.svg$/.test(file) && path.posix.basename(file) !== '.DS_Store';

/** The real zip (scripts/package.mjs) of `from`, listed by unzip. */
async function zipped(from) {
  const tmp = await mkdtemp(path.join(tmpdir(), 'upright-zip-'));
  try {
    const zip = await zipExtension(from, path.join(tmp, 'out.zip'));
    return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').sort();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

describe('package', () => {
  test('the zip is exactly extension/, less the SVG sources, with manifest.json at its root', async () => {
    expect(path.resolve(EXTENSION)).toBe(path.resolve(extension));
    const files = await filesUnder(extension);
    const entries = await zipped(extension);
    expect(entries).toEqual(files.filter(ships));
    expect(entries).toContain('manifest.json');
    expect(entries).toContain('_locales/en/messages.json');
    expect(files.filter((file) => file.endsWith('.svg')).length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.endsWith('.svg') || entry.endsWith('/'))).toEqual([]);
  });

  test('.DS_Store files anywhere in extension/ are left out', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'upright-copy-'));
    try {
      const copy = path.join(tmp, 'extension');
      await cp(extension, copy, { recursive: true });
      await writeFile(path.join(copy, '.DS_Store'), 'x');
      await writeFile(path.join(copy, 'viewer', '.DS_Store'), 'x');
      const entries = await zipped(copy);
      expect(entries.filter((entry) => entry.endsWith('.DS_Store'))).toEqual([]);
      expect(entries).toEqual((await filesUnder(extension)).filter(ships));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('every path the extension names resolves to a file inside extension/', async () => {
    const files = await filesUnder(extension);
    const missing = [];
    const check = (from, target) => {
      const file = path.resolve(extension, from, target);
      if (!file.startsWith(extension) || !existsSync(file)) missing.push(`${from || 'root'} → ${target}`);
    };
    for (const file of files) {
      const dir = path.posix.dirname(file);
      if (file.endsWith('.js')) {
        const src = await readFile(path.join(extension, file), 'utf8');
        for (const [, spec] of src.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) check(dir, spec);
        // chrome.runtime.getURL paths are from the extension's root.
        for (const [, ref] of src.matchAll(/getURL\('([^']+)'\)/g)) check('', ref);
      } else if (file.endsWith('.html')) {
        const src = await readFile(path.join(extension, file), 'utf8');
        for (const [, ref] of src.matchAll(/(?:src|href)="([^"#:]+)"/g)) check(dir, ref);
      }
    }
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    for (const ref of [manifest.background.service_worker, manifest.options_ui.page,
      ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
      ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
      SCRIPT_FILE, OFFSCREEN_PATH]) check('', ref);
    expect(missing).toEqual([]);
  });

  test('the single-key content script can load what it imports: keys.js and its imports are web accessible', async () => {
    const resources = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'))
      .web_accessible_resources.flatMap((entry) => entry.resources);
    const loaded = new Set();
    const visit = async (file) => {
      if (loaded.has(file)) return;
      loaded.add(file);
      const src = await readFile(path.join(extension, file), 'utf8');
      for (const [, spec] of src.matchAll(/from\s*'(\.{1,2}\/[^']+)'/g)) await visit(path.posix.join(path.posix.dirname(file), spec));
    };
    const loader = await readFile(path.join(extension, SCRIPT_FILE), 'utf8');
    const [, entry] = loader.match(/getURL\('([^']+)'\)/);
    await visit(entry);
    expect([...loaded].sort()).toEqual([...resources].sort());
  });
});
