import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOOP = path.join(__dirname, 'electron/_noop.ts');

export default defineConfig({
  // Tell Vite this is NOT an HTML app build
  appType: 'custom',

  // Make the top-level Vite build a no-op
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist-electron/_ignore',
    rollupOptions: { input: NOOP },
  },

  plugins: [
    electron({
      // ----- MAIN (CJS) -----
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            target: 'node20',
            minify: false,
            sourcemap: false,
            rollupOptions: {
              output: { entryFileNames: 'index.cjs', format: 'cjs' },
            },
          },
        },
      },

      // ----- PRELOAD (CJS) -----
      preload: {
        input: { preload: 'electron/preload.ts' },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            target: 'node20',
            minify: false,
            sourcemap: false,
            rollupOptions: {
              output: { entryFileNames: '[name].cjs', format: 'cjs' },
            },
          },
        },
      },

      // IMPORTANT: no renderer block here
    }),
  ],
});
