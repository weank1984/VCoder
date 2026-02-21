import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'packages/*/src/**/*.ts',
        'apps/vscode-extension/src/**/*.ts',
        'apps/vscode-extension/webview/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'apps/vscode-extension/**/node_modules/**',
        'apps/vscode-extension/**/dist/**',
        'apps/vscode-extension/**/out/**',
        'packages/*/node_modules/**',
        'packages/*/dist/**',
        'packages/*/out/**',
        'tests/**',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@vcoder/shared': resolve(__dirname, './packages/shared/src'),
      '@vcoder/server': resolve(__dirname, './packages/server/src'),
      'vscode': resolve(__dirname, './tests/mocks/vscode.ts'),
    },
  },
});
