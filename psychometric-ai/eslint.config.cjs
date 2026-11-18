// ESLint flat config — catches real defects (unused vars, unreachable code,
// accidental globals) without imposing stylistic churn on an existing codebase.
//
// Frontend is vanilla JS loaded via <script> tags in a fixed order
// (index.html): secureRender.js exposes the shared globals `esc` and
// `renderNarrative` to every later file. These are intentional, audited
// globals — not leaks — so they are declared here explicitly.
const js = require('@eslint/js');
const globals = require('globals');

const sharedGlobals = {
  // cross-file frontend helpers from secureRender.js (loaded first)
  esc: 'readonly',
  renderNarrative: 'readonly'
};

module.exports = [
  js.configs.recommended,
  {
    // Node.js backend + tooling
    files: ['backend/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-fallthrough': 'error',
      'no-async-promise-executor': 'error',
      'require-atomic-updates': 'off'
    }
  },
  {
    // Browser frontend (vanilla JS, no bundler)
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, ...sharedGlobals }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-async-promise-executor': 'error'
    }
  },
  {
    // secureRender.js is the DEFINITION site of the shared globals.
    files: ['frontend/js/secureRender.js'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    // node:test files use describe/it/test/expect from node:test runner
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.mocha }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    ignores: ['node_modules/**', 'data/**', '**/*.min.js', 'build/**', 'eslint.config.cjs']
  }
];
