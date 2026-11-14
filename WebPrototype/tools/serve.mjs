#!/usr/bin/env node
/** Tiny static server for the built game. Binds publicly for sandbox live previews. */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build, outputPath, prototypeRoot } from './build.mjs';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be 0..65535');
build();

const server = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, game: 'wildrune' }));
  }
  if (path === '/' || path === '/index.html' || path === '/Wildrune.html' || path === '/dist/index.html') {
    const body = readFileSync(outputPath);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  if (path === '/favicon.ico') { res.writeHead(204); return res.end(); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, host, () => {
  const actual = server.address().port;
  console.log(`WILDRUNE listening on http://${host}:${actual}`);
});
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
export { server };
