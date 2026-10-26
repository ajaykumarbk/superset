// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEV:  Vite dev server → port 5173
//       Backend dev server → port 5174  (set PORT=5174 in backend/.env for dev)
// PROD: Node.js backend serves the built frontend on port 5173 (single process)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: 'http://127.0.0.1:5174', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:5174', ws: true, changeOrigin: true },
    },
  },
});
