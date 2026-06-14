import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, ViteDevServer} from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

const apiChatMiddleware = () => ({
  name: 'api-chat-middleware',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.url && req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { messages, personalization, clientTime, clientTimezone, modelId } = JSON.parse(body);
            if (!messages || !Array.isArray(messages)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: 'Invalid messages array' }));
            }
            const { streamChat } = await import('./lib/openrouter-api.js');
            await streamChat(messages, personalization, res, { clientTime, clientTimezone }, modelId);
          } catch (err: any) {
            console.error("Vite middleware error:", err);
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message || 'Invalid or malformed payload' }));
            }
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiChatMiddleware()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
