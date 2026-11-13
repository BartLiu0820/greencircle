'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
// Only h5/ is public. Missing assets must stay 404 (never return index.html).
async function serveStatic(req, res, root, pathname) {
  const fail = code => { res.writeHead(code, { 'Cache-Control': 'no-store' }); res.end(); };
  if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
  try {
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    if (relative.includes('\0') || relative.split(/[\\/]/).some(p => p.startsWith('.'))) return fail(404);
    const base = await fs.promises.realpath(root);
    const file = await fs.promises.realpath(path.resolve(base, '.' + relative));
    if (!file.startsWith(base + path.sep)) return fail(404);
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return fail(404);
    const ext = path.extname(file), etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'private, no-cache', 'ETag': etag, 'Vary': 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html', '.js', '.css', '.json', '.svg'].includes(ext);
    if (gzip) headers['Content-Encoding'] = 'gzip'; else headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const streams = [fs.createReadStream(file)];
    if (gzip) streams.push(zlib.createGzip());
    pipeline(...streams, res, () => {});
  } catch (e) { if (!res.headersSent) fail(e instanceof URIError ? 400 : 404); else res.destroy(); }
}
module.exports = { serveStatic };
