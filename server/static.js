// Arquivos estáticos no Node local — imita o binding ASSETS da Cloudflare:
// serve a pasta public/ ("/" -> index.html, "/links" -> links.html), com o
// mesmo cache de antes. O _headers é configuração da Cloudflare, não arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { mimeFor } from '../src/util.js';

const notFound = () => new Response('Not found', { status: 404 });

export function staticAssets(publicDir) {
  const base = path.resolve(publicDir);
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let p;
      try { p = decodeURIComponent(url.pathname); } catch { return notFound(); }
      if (p === '/index.html') return new Response(null, { status: 307, headers: { Location: '/' } });
      if (p === '/links.html' || p === '/links/') return new Response(null, { status: 307, headers: { Location: '/links' } });
      if (p === '/') p = '/index.html';
      else if (p === '/links') p = '/links.html';
      if (p === '/_headers' || p.split('/').some((seg) => seg.startsWith('.'))) return notFound();
      const abs = path.resolve(base, '.' + p);
      if (!abs.startsWith(base + path.sep)) return notFound();
      let stat;
      try { stat = fs.statSync(abs); } catch { return notFound(); }
      if (!stat.isFile()) return notFound();
      // HTML/JS/CSS sempre revalidados (um sacola.js velho com um index.html
      // novo quebra o site); imagens com cache de 24h.
      const ext = path.extname(abs).toLowerCase();
      const revalida = ext === '.html' || ext === '.js' || ext === '.css';
      const headers = {
        'Content-Type': mimeFor(abs),
        'Cache-Control': revalida ? 'no-cache' : 'public, max-age=86400',
        'Last-Modified': stat.mtime.toUTCString(),
      };
      const ims = request.headers.get('if-modified-since');
      if (ims && Math.floor(stat.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000)) {
        return new Response(null, { status: 304, headers });
      }
      headers['Content-Length'] = String(stat.size);
      return new Response(request.method === 'HEAD' ? null : fs.readFileSync(abs), { status: 200, headers });
    },
  };
}
