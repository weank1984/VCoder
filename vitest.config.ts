import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
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
    },
  },
});
