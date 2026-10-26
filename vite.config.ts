import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Seiten mit eigener URL (`/impressum` usw.) als statische Einstiegspunkte.
 *
 * GitHub Pages kennt keine SPA-Rewrites. Deshalb bekommt jede Seite eine eigene
 * `index.html` (direkter Aufruf liefert 200) und `404.html` dient als Fallback
 * für alle übrigen Pfade. Die App liest die Route anschließend aus der URL.
 */
const ROUTES = ['idee', 'impressum', 'datenschutz', 'datenspeicherung'];

function routePages(): Plugin {
  let outDir = 'dist';

  return {
    name: 'demokratiepost-route-pages',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html');
      for (const route of ROUTES) {
        const dir = resolve(outDir, route);
        mkdirSync(dir, { recursive: true });
        copyFileSync(index, resolve(dir, 'index.html'));
      }
      copyFileSync(index, resolve(outDir, '404.html'));
    },
  };
}

// GitHub Pages: Eigene Domain (https://demokratiepost.de) → base '/'.
// Ohne eigene Domain müsste hier der Repo-Name stehen ('/demokratiepost/').
export default defineConfig({
  base: '/',
  plugins: [react(), routePages()],
});
