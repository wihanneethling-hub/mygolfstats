import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function localNetlifyFunctions() {
  const functions = {
    '/.netlify/functions/process-round': './netlify/functions/process-round.js',
    '/.netlify/functions/rename-course-layout': './netlify/functions/rename-course-layout.js',
    '/.netlify/functions/save-course-layout': './netlify/functions/save-course-layout.js',
    '/.netlify/functions/transcribe': './netlify/functions/transcribe.js'
  };

  async function readBody(req) {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  return {
    name: 'local-netlify-functions',
    configureServer(server) {
      Object.entries(functions).forEach(([route, functionPath]) => {
        server.middlewares.use(route, async (req, res) => {
          try {
            const mod = await import(`${functionPath}?t=${Date.now()}`);
            const result = await mod.handler({
              httpMethod: req.method,
              headers: req.headers,
              body: await readBody(req)
            });

            res.statusCode = result.statusCode || 200;
            Object.entries(result.headers || {}).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
            res.end(result.body || '');
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message || 'Local function failed' }));
          }
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [
      localNetlifyFunctions(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'Golf Round Tracker',
          short_name: 'Golf Stats',
          description: 'A mobile-first golf round tracker for round logging, history, and stats.',
          theme_color: '#efeeeb',
          background_color: '#efeeeb',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ]
  };
});
