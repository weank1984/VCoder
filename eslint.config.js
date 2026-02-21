import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/.turbo/**',
    '**/*.d.ts',
    'apps/vscode-extension/webview/dist/**',
  ]),
  {
    files: [
      'packages/shared/src/**/*.{ts,tsx}',
      'packages/server/src/**/*.{ts,tsx}',
      'apps/vscode-extension/src/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/server/src/history/transcriptStore.ts'],
    rules: {
      // This module parses untyped JSONL from external tools; permissive typing keeps the code readable.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
