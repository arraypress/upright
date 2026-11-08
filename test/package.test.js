/**
 * The store zip is exactly extension/, less source-only files; every path the extension names
 * resolves inside it; and the single-key content script can load everything it imports.
 *
 * @module test/package
 */
import { describe, expect, test } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shipsFile } from '@arraypress/extension-kit/build';
import { filesUnder, missingReferences, zipEntries } from '@arraypress/extension-kit/testing';
import { OFFSCREEN_PATH } from '../extension/vendor/extension-kit/index.js';
import { SCRIPT_FILE } from '../extension/shared/registration.js';

const extension = fileURLToPath(new URL('../extension/', import.meta.url));

describe('package', () => {
  test('the zip is exactly extension/, less the SVG sources and declarations, with manifest.json at its root', async () => {
    const files = await filesUnder(extension);
    const entries = await zipEntries(extension);
    expect(entries).toEqual(files.filter(shipsFile));
    expect(entries).toContain('manifest.json');
    expect(entries).toContain('_locales/en/messages.json');
    expect(entries).toContain('vendor/extension-kit/styles/chrome-ui.css');
    expect(files.filter((file) => file.endsWith('.svg')).length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.endsWith('.svg') || entry.endsWith('.d.ts') || entry.endsWith('/'))).toEqual([]);
  });

  test('.DS_Store files anywhere in extension/ are left out', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'upright-copy-'));
    try {
      const copy = path.join(tmp, 'extension');
      await cp(extension, copy, { recursive: true });
      await writeFile(path.join(copy, '.DS_Store'), 'x');
      await writeFile(path.join(copy, 'viewer', '.DS_Store'), 'x');
      const entries = await zipEntries(copy);
      expect(entries.filter((entry) => entry.endsWith('.DS_Store'))).toEqual([]);
      expect(entries).toEqual((await filesUnder(extension)).filter(shipsFile));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('every path the extension names resolves to a file inside extension/', async () => {
    expect(await missingReferences(extension, [SCRIPT_FILE, OFFSCREEN_PATH])).toEqual([]);
  });

  test('the single-key content script can load what it imports: keys.js and its imports are web accessible', async () => {
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    const resources = manifest.web_accessible_resources.flatMap((/** @type {{resources: string[]}} */ entry) => entry.resources);
    /** @type {Set<string>} */
    const loaded = new Set();
    /** @param {string} file */
    const visit = async (file) => {
      if (loaded.has(file)) return;
      loaded.add(file);
      const source = await readFile(path.join(extension, file), 'utf8');
      for (const [, spec] of source.matchAll(/from\s*'(\.{1,2}\/[^']+)'/g)) await visit(path.posix.join(path.posix.dirname(file), spec));
    };
    const loader = await readFile(path.join(extension, SCRIPT_FILE), 'utf8');
    const [, entry] = loader.match(/getURL\('([^']+)'\)/) ?? [];
    await visit(entry);
    expect([...loaded].sort()).toEqual([...resources].sort());
  });
});
