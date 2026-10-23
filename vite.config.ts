import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: Der base-Pfad muss dem Repo-Namen entsprechen.
// Bei einer eigenen Domain (z. B. meine-beschwerde.de) auf '/' setzen.
export default defineConfig({
  base: '/meine-beschwerde/',
  plugins: [react()],
});
