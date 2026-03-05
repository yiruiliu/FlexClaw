import http from 'http';
import https from 'https';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export interface ModelProxy {
  port: number;
  close(): void;
}

export function startModelProxy(): Promise<ModelProxy | null> {
  const { API_BASE_URL, API_KEY, MODEL_ID } = readEnvFile([
    'API_BASE_URL',
    'API_KEY',
    'MODEL_ID',
  ]);
  if (!API_BASE_URL) return Promise.resolve(null);

  const targetUrl = new URL(API_BASE_URL);

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let requestBody = body;

      // Replace model in /v1/messages POST requests
      if (req.method === 'POST' && req.url?.includes('/messages') && MODEL_ID) {
        try {
          const parsed = JSON.parse(body);
          parsed.model = MODEL_ID;
          requestBody = JSON.stringify(parsed);
        } catch {
          /* leave body unchanged */
        }
      }

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname.replace(/\/$/, '') + req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.hostname,
          'content-length': Buffer.byteLength(requestBody).toString(),
          ...(API_KEY
            ? { authorization: `Bearer ${API_KEY}`, 'x-api-key': API_KEY }
            : {}),
        },
      };

      const proto = targetUrl.protocol === 'https:' ? https : http;
      const proxyReq = proto.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (err) => {
        logger.error({ err }, 'Model proxy forward error');
        res.writeHead(502);
        res.end('Proxy error');
      });
      proxyReq.write(requestBody);
      proxyReq.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as { port: number }).port;
      logger.info(
        { port, target: API_BASE_URL, model: MODEL_ID },
        'Model proxy started',
      );
      resolve({ port, close: () => server.close() });
    });
  });
}
