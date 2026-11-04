import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom UI is served from a Forge resource, so assets must resolve relatively.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: '../static/relay', emptyOutDir: true, sourcemap: false },
  server: { host: '0.0.0.0', port: 5180, strictPort: true, allowedHosts: true },
});
