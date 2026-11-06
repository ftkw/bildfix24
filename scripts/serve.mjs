/**
 * Minimaler Static-Server für den Inhalt von dist/.
 * Nur für die lokale Vorschau gedacht – kein Ersatz für das Hosting.
 *
 * Aufruf: npm run serve  (bzw. node scripts/serve.mjs [port])
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist');
const startPort = Number(process.argv[2] || process.env.PORT || 8080);
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = normalize(join(root, clean));
  // Kein Ausbruch aus dist/ erlauben.
  if (!target.startsWith(root)) return null;

  for (const candidate of [target, join(target, 'index.html'), `${target}.html`]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* weiter probieren */
    }
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url || '/');

  if (!file) {
    const notFound = join(root, '404.html');
    try {
      const body = statSync(notFound);
      res.writeHead(404, {
        'content-type': MIME['.html'],
        'content-length': body.size,
        'cache-control': 'no-store'
      });
      createReadStream(notFound).pipe(res);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 – nicht gefunden');
    }
    return;
  }

  const stats = statSync(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const isHashed = /\/_astro\//.test(file);

  res.writeHead(200, {
    'content-type': type,
    'content-length': stats.size,
    'cache-control': isHashed ? 'public, max-age=31536000, immutable' : 'no-store'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

function listen(port, attempt = 0) {
  server.once('error', error => {
    if (error.code === 'EADDRINUSE' && attempt < 10) {
      listen(port + 1, attempt + 1);
      return;
    }
    console.error('Server konnte nicht starten:', error.message);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`\n  bildfix24 – lokale Vorschau\n`);
    console.log(`  →  http://${host}:${port}/\n`);
    console.log(`  Wurzel: ${root}`);
    console.log(`  Beenden mit Ctrl + C\n`);
  });
}

if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('dist/ fehlt. Bitte zuerst "npm run build" ausführen.');
  process.exit(1);
}

listen(startPort);
