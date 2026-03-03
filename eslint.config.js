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
      'packages/ui/src/**/*.{ts,tsx}',
      'apps/vscode-extension/src/**/*.{ts,tsx}',
      'apps/vscode-extension/webview/src/**/*.{ts,tsx}',
      'apps/desktop-shell/src/**/*.{ts,tsx}',
      'apps/desktop-shell/webview/src/**/*.{ts,tsx}',
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
  {
    files: ['apps/vscode-extension/src/extension.ts'],
    rules: {
      // ACP request handler params arrive as unknown from JSON-RPC; `as any` bridges to typed service methods.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['packages/ui/src/bridge.ts'],
    rules: {
      // Triple-slash reference is required here for global type augmentation of acquireVsCodeApi.
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
]);
