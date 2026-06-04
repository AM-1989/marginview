import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,

        // Se Express non è avviato, restituisce JSON leggibile
        // invece del fallback HTML di Vite (che causava "Unexpected token '<'")
        configure: (proxy) => {
          proxy.on('error', (_err: Error, _req: IncomingMessage, res: ServerResponse) => {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Server API non raggiungibile — avvia Express con: npm run server',
            }));
          });
        },
      },
    },
  },
});
