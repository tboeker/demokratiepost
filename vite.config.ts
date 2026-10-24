import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: Der base-Pfad muss dem Repo-Namen entsprechen.
// Bei einer eigenen Domain (z. B. demokratiepost.de) auf '/' setzen.
export default defineConfig({
  base: '/demokratiepost/',
  plugins: [react()],
});
