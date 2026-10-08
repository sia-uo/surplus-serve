import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Injects the list of built files into dist/sw.js so the service worker can
 * precache the app shell, and stamps a content hash as the cache version.
 */
function serviceWorkerManifest(): Plugin {
  let files: string[] = [];
  return {
    name: 'surplusserve-sw-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // Fonts: precache Latin subsets only (others still load on demand via unicode-range).
      files = Object.keys(bundle).filter((f) => /\.(js|css|svg|png|webmanifest)$/.test(f) || (/\.woff2$/.test(f) && /-latin-/.test(f)));
    },
    writeBundle(opts) {
      const out = opts.dir ?? resolve(root, 'dist');
      const swPath = resolve(out, 'sw.js');
      const statics = ['/', '/offline.html', '/manifest.webmanifest', '/logo.svg', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
      const list = [...new Set([...statics, ...files.map((f) => `/${f}`)])].filter((f) => f !== '/sw.js');
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const sw = readFileSync(swPath, 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(list))
        .replace('__CACHE_VERSION__', version);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  root,
  plugins: [react(), tailwindcss(), serviceWorkerManifest()],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
