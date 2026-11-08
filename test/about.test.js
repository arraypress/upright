/**
 * The About card's links. The placeholder warning and repository reminder are tested in
 * @arraypress/extension-kit; here, that these links are real and the package step prints them.
 *
 * @module test/about
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { isPlaceholder } from '../extension/vendor/extension-kit/index.js';
import { ABOUT_LINKS, REPOSITORY } from '../extension/options/about-links.js';

describe('about links', () => {
  test('help, “Report an issue” and privacy all live in the GitHub repository', () => {
    expect(REPOSITORY).toBe('https://github.com/arraypress/upright');
    expect(ABOUT_LINKS).toEqual({
      help: 'https://github.com/arraypress/upright#readme',
      reportIssue: 'https://github.com/arraypress/upright/issues',
      privacyPolicy: 'https://github.com/arraypress/upright/blob/main/PRIVACY.md',
    });
    expect(Object.values(ABOUT_LINKS).filter(isPlaceholder)).toEqual([]);
  });

  test('the package step ends with the About links’ checks', () => {
    expect(readFileSync(new URL('../scripts/package.mjs', import.meta.url), 'utf8')).toMatch(/printReleaseChecks\(ABOUT_LINKS, REPOSITORY\);\s*$/);
  });
});
