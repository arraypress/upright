/**
 * The support contact: one address, for support and privacy questions, written where people and
 * the store's listing read it (PRIVACY.md's Contact, CHROMEWEBSTORE.md's Support URL), with no
 * placeholder and no other address left beside it.
 *
 * @module test/support
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

/** The contact for support and privacy questions, for now. */
const SUPPORT = 'support@arraypress.com';

/** @param {string} name @returns {string} A file at the repository's root. */
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

describe('the support contact', () => {
  test('PRIVACY.md’s Contact section and the store notes’ Support URL name it', () => {
    expect(read('PRIVACY.md').split(/^## Contact$/m)[1]).toContain(SUPPORT);
    expect(read('CHROMEWEBSTORE.md')).toMatch(new RegExp(`\\*\\*Support URL\\*\\*[^\\n]*mailto:${SUPPORT.replace('.', '\\.')}`));
  });

  test('no placeholder, and no other address, is left in either', () => {
    for (const name of ['PRIVACY.md', 'CHROMEWEBSTORE.md']) {
      const text = read(name);
      expect(text, name).not.toMatch(/\[SUPPORT EMAIL\]|address David chooses/);
      expect([...new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])], name).toEqual([SUPPORT]);
    }
  });
});
