import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: permite publicar em qualquer subpasta (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'] } } } },
  test: { environment: 'node' },
} as any);
