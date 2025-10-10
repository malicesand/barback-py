// apps/desktop/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  server: {
    open: false,      // <-- disables opening your system browser
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    electron({
      main:    { entry: 'electron/main.ts',
        onstart(options) {
          options.startup();
        },
       },
      preload: { input: { preload: 'electron/preload.ts' } },
    }),
  ],
});
