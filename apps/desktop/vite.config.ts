import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  server: { open: false, port: 5173, strictPort: true },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        onstart(opts) { opts.startup(); },
      },
      preload: {
        input: { preload: 'electron/preload.ts' },
      },
    }),
  ],
  build: { outDir: 'dist', sourcemap: false },
});
