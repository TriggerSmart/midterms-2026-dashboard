'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = 8765;
const ROOT = path.resolve(__dirname);
const MIME = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.ico':'image/x-icon'
};

function safeFilePath(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}:${PORT}`).pathname); }
  catch { return null; }
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(ROOT, `.${pathname}`);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

const server = http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method)) {
    res.writeHead(405, {'Content-Type':'text/plain; charset=utf-8','Allow':'GET, HEAD'});
    return res.end('Method not allowed');
  }
  const filePath = safeFilePath(req.url || '/');
  if (!filePath) {
    res.writeHead(400, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('Bad request');
  }
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Not found');
    }
    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

function openBrowser(url) {
  if (process.argv.includes('--no-open')) return;
  const options = {detached:true, stdio:'ignore'};
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], options).unref();
    else if (process.platform === 'darwin') spawn('open', [url], options).unref();
    else spawn('xdg-open', [url], options).unref();
  } catch (_) {
    // The URL is also printed below so the dashboard remains usable if auto-open is unavailable.
  }
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`2026 Midterms Command Center: ${url}`);
  console.log('Press Ctrl+C to stop the local dashboard server.');
  openBrowser(url);
});

server.on('error', err => {
  console.error(`Could not start local server on ${HOST}:${PORT}: ${err.message}`);
  process.exitCode = 1;
});
