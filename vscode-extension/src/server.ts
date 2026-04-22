import * as http from 'http';
import { EndpointData } from './types';

export function createServer(
  onEndpointsReceived: (endpoints: EndpointData[]) => Promise<void>
): http.Server {
  const server = http.createServer((req, res) => {
    const origin = String(req.headers['origin'] || '');
    const trusted = origin === 'null' || origin.startsWith('chrome-extension://');
    const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '';

    if (trusted) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(trusted ? 204 : 403);
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/endpoints') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const endpoints: EndpointData[] = JSON.parse(body);
          if (!Array.isArray(endpoints) || endpoints.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Expected a non-empty array of endpoints' }));
            return;
          }
          onEndpointsReceived(endpoints).catch((err) => {
            console.error('QA Generator: Endpoint handler error:', err);
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            count: endpoints.length,
            message: `Received ${endpoints.length} endpoint(s). Run "Generate API Tests" in VS Code.`,
          }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return server;
}
