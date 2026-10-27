// Servidor Node local — roda o MESMO roteador do Worker da Cloudflare
// (src/app.js) usando SQLite embutido (server/sqlite-d1.js) e a pasta
// uploads/ no lugar do D1 e do R2. Serve para desenvolver sem conta na
// Cloudflare, para os testes, e para manter o Railway no ar até a troca.
//
//   node server/app.js            (ou: npm run dev)
//   PORT=3000 node server/app.js
import http from 'node:http';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { handle, configFromEnv } from '../src/app.js';
import { openDatabase } from './sqlite-d1.js';
import { fsStorage } from './storage-fs.js';
import { staticAssets } from './static.js';
import { PUBLIC_DIR, storagePaths } from './paths.js';

/** Dependências do roteador no Node (banco, fotos, estáticos, config). */
export function createNodeDeps(env = process.env, { db } = {}) {
  const { DB_PATH, UPLOADS_DIR } = storagePaths(env);
  return {
    db: db || openDatabase(DB_PATH),
    storage: fsStorage(UPLOADS_DIR),
    assets: staticAssets(PUBLIC_DIR),
    images: null,
    config: configFromEnv(env),
  };
}

// Só confia em X-Forwarded-* com TRUST_PROXY=1 (proxy reverso de verdade na
// frente, como no Railway) — sem proxy, esses cabeçalhos são fáceis de forjar.
function requestInfo(req, trustProxy) {
  const fwd = (name) => String(req.headers[name] || '').split(',')[0].trim();
  const proto = req.socket.encrypted ? 'https' : (trustProxy && fwd('x-forwarded-proto') === 'https' ? 'https' : 'http');
  const ip = (trustProxy && fwd('x-forwarded-for')) || req.socket.remoteAddress || '';
  return { proto, ip };
}

function toRequest(req, proto) {
  const url = `${proto}://${req.headers.host || 'localhost'}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x)); else if (v != null) headers.set(k, v);
  }
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = Readable.toWeb(req); init.duplex = 'half'; }
  return new Request(url, init);
}

async function writeResponse(res, response) {
  const headers = {};
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  if (!response.body) return res.end();
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

export function createServer(deps, { trustProxy = process.env.TRUST_PROXY === '1' } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const { proto, ip } = requestInfo(req, trustProxy);
      const response = await handle(toRequest(req, proto), { ...deps, clientIp: ip });
      await writeResponse(res, response);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro interno.');
    }
  });
}

/** Sobe o servidor com desligamento gracioso (SIGTERM na troca de versão). */
export function listen(deps, port = parseInt(process.env.PORT, 10) || 3000) {
  const server = createServer(deps);
  server.listen(port, () => {
    console.log(`Essência Natural rodando em http://localhost:${port} — admin em /admin/login`);
  });
  const desligar = (signal) => {
    console.log(`\n${signal} recebido — encerrando servidor com calma...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => desligar('SIGTERM'));
  process.on('SIGINT', () => desligar('SIGINT'));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  listen(createNodeDeps());
}
