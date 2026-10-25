import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: Eigene Domain (https://demokratiepost.de) → base '/'.
// Ohne eigene Domain müsste hier der Repo-Name stehen ('/demokratiepost/').
export default defineConfig({
  base: '/',
  plugins: [react()],
});
