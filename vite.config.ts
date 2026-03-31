import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      'vs': path.resolve(__dirname, 'src/vs'),
    },
  },
  build: {
    target: ['es2022', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs',
              '@tauri-apps/plugin-clipboard-manager', '@tauri-apps/plugin-shell',
              '@tauri-apps/plugin-notification', '@tauri-apps/plugin-opener'],
  },
  worker: {
    format: 'es',
  },
});
