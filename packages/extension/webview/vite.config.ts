import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vcoder/shared': resolve(__dirname, '../../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
      },
    },
    // For VSCode Webview, we need a single bundle
    cssCodeSplit: false,
  },
  // No public path since VSCode handles resource URIs
  base: '',
})
