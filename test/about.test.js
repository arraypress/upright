import { describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ABOUT_LINKS, isPlaceholder } from '../extension/options/about-links.js';
import { placeholderWarning } from '../scripts/warn-placeholder-links.mjs';

const script = fileURLToPath(new URL('../scripts/warn-placeholder-links.mjs', import.meta.url));

describe('about links', () => {
  test('help and privacy on the web, “Report an issue” emails the developer', () => {
    expect(Object.keys(ABOUT_LINKS)).toEqual(['help', 'reportIssue', 'privacyPolicy']);
    expect(ABOUT_LINKS.help).toMatch(/^https:\/\//);
    expect(ABOUT_LINKS.privacyPolicy).toMatch(/^https:\/\//);
    // All three live in the GitHub repo: README, Issues, PRIVACY.md.
    expect(ABOUT_LINKS).toEqual({
      help: 'https://github.com/arraypress/upright#readme',
      reportIssue: 'https://github.com/arraypress/upright/issues',
      privacyPolicy: 'https://github.com/arraypress/upright/blob/main/PRIVACY.md',
    });
    // Everything under extension/ ships (test/package.test.js).
    expect(existsSync(new URL('../extension/options/about-links.js', import.meta.url))).toBe(true);
  });

  test('example.com (and its subdomains) is a placeholder; a real domain or mailto isn’t', () => {
    expect(isPlaceholder('https://example.com/x')).toBe(true);
    expect(isPlaceholder('https://www.example.net/x')).toBe(true);
    expect(isPlaceholder('https://arraypress.com/upright/help')).toBe(false);
    expect(isPlaceholder('https://notexample.com/')).toBe(false);
    expect(isPlaceholder(ABOUT_LINKS.reportIssue)).toBe(false);
  });

  test('package warning: printed loudly while a link is a placeholder, naming each one', () => {
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(run.status).toBe(0); // A warning, not a failure: the zip is still fine for testing.
    const placeholders = Object.entries(ABOUT_LINKS).filter(([, url]) => isPlaceholder(url));
    if (!placeholders.length) return expect(run.stderr).toBe('');
    expect(run.stderr).toMatch(/WARNING: the About card still has placeholder links/);
    for (const [name, url] of placeholders) expect(run.stderr).toContain(`${name}: ${url}`);
    expect(run.stderr).not.toContain('reportIssue');
  });

  test('package warning: none once every link is real', () => {
    expect(placeholderWarning({
      help: 'https://arraypress.com/upright/help',
      reportIssue: ABOUT_LINKS.reportIssue,
      privacyPolicy: 'https://arraypress.com/upright/privacy',
    })).toBeNull();
  });

  test('the package script prints the warning', () => {
    const source = readFileSync(new URL('../scripts/package.mjs', import.meta.url), 'utf8');
    expect(source).toMatch(/import \{ placeholderWarning, repositoryReminder \} from '\.\/warn-placeholder-links\.mjs'/);
    expect(source).toMatch(/const warning = placeholderWarning\(\);\n\s*if \(warning\) console\.warn/);
    expect(source).toMatch(/const reminder = repositoryReminder\(\);\n\s*if \(reminder\) console\.log/);
  });
});

describe('package reminder', () => {
  test('links on GitHub mean the repo must be public before submitting', async () => {
    const { repositoryReminder } = await import('../scripts/warn-placeholder-links.mjs');
    expect(repositoryReminder()).toMatch(/Make the repository public before submitting/);
    expect(repositoryReminder({ help: 'https://plainly.tools/help' })).toBeNull();
  });
});
