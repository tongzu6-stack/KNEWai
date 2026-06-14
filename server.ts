import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { streamChat } from './lib/openrouter-api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Parse request bodies
  app.use(express.json());

  // API route proxies Gemini call
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, personalization, clientTime, clientTimezone, modelId } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid context payload" });
      }
      await streamChat(messages, personalization, res, { clientTime, clientTimezone }, modelId);
    } catch (error: any) {
      console.error("Express API error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || "Internal server error" });
      }
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve compiled static UI files in production
    app.use(express.static(path.join(process.cwd(), 'dist')));
    
    // Fallback SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Productive core running at http://0.0.0.0:${port}`);
  });
}

startServer();
