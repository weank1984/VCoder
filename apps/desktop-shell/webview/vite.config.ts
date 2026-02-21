import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vcoder/shared': resolve(__dirname, '../../../packages/shared/src/index.ts'),
      '@vcoder/ui': resolve(__dirname, '../../../packages/ui/src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [resolve(__dirname, '../../../packages/ui/src')],
      },
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
    // Single bundle for Electron webview
    cssCodeSplit: false,
  },
  base: '',
  server: {
    port: 5174,
    strictPort: true,
  },
})
