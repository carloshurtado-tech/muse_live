// Lints the platform code, functions, tools and tests. The legacy app bundles (muse-app-a/b and
// friends) are excluded until they are migrated — see docs/MIGRATION.md.
import js from '@eslint/js';
import globals from 'globals';

const rules = {
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { ignores: ['node_modules/**', 'js/**', '!js/muse-sync.js', '!js/muse-observe.js', 'glasses/**', 'assets/**', 'css/**', 'config/**', 'ops/**', 'test-results/**', 'playwright-report/**', '.stage/**', 'dist/**'] },
  js.configs.recommended,
  { files: ['functions/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.worker, ...globals.es2021 } }, rules },
  { files: ['js/muse-sync.js', 'js/muse-observe.js'], languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: { ...globals.browser } }, rules },
  { files: ['tools/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'eval/**/*.mjs', 'eslint.config.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules },
];
