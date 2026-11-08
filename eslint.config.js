/**
 * ESLint's recommended rules, plus modern-JS ones (no var, prefer const, no unused variables),
 * for every script in the repo. The kit's copy in extension/vendor/ is linted in its own repo.
 *
 * @module eslint.config
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'release/', '.test-builds/', 'extension/vendor/', '**/*.d.ts'] },
  js.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: 'readonly' } },
    rules: { 'no-var': 'error', 'prefer-const': 'error', 'no-unused-vars': 'error' },
  },
];
