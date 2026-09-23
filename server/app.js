// Servidor HTTP da Essência Natural V2 — só módulos nativos do Node (o
// ambiente onde isto foi criado bloqueia `npm install`; ver README-V2.md).
// Serve os arquivos estáticos do site antigo (index.html, assets/,
// uploads/), a API pública do catálogo, a página de produto, e o admin
// (páginas + API JSON). Um arquivo só, sem framework — dá pra ler de cima
// a baixo.
//
//   node server/app.js
//   PORT=3000 node server/app.js
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const auth = require('./auth');
const { sendJSON, sendHTML, MIME_BY_EXT } = require('./util');
const publicApi = require('./routes/publicApi');
const productPage = require('./routes/productPage');
const adminApi = require('./routes/adminApi');
const adminPages = require('./routes/adminPages');

const { ROOT, UPLOADS_DIR } = require('./paths');
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ---------- arquivos estáticos ----------
// O site antigo é só HTML/CSS/JS na raiz do projeto; servimos direto do
// disco, sem cópia nem build step algum.
const STATIC_ROOTS = [
  { prefix: '/assets/', dir: path.join(ROOT, 'assets') },
  { prefix: '/uploads/', dir: UPLOADS_DIR }, // pasta local ou volume da hospedagem (server/paths.js)
];
const STATIC_FILES = {
  '/': path.join(ROOT, 'index.html'),
  '/index.html': path.join(ROOT, 'index.html'),
  '/robots.txt': path.join(ROOT, 'robots.txt'),
  '/sitemap.xml': path.join(ROOT, 'sitemap.xml'),
  '/favicon.ico': path.join(ROOT, 'assets', 'icons', 'favicon.ico'),
};

function serveFile(req, res, absPath) {
  fs.stat(absPath, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      // HTML sempre revalidado (pode mudar a qualquer commit); imagens e
      // uploads podem ser cacheados por mais tempo (ver docs/CATALOGO.md).
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    fs.createReadStream(absPath).pipe(res);
  });
}

function tryServeStatic(req, res, pathname) {
  if (STATIC_FILES[pathname]) { serveFile(req, res, STATIC_FILES[pathname]); return true; }
  for (const { prefix, dir } of STATIC_ROOTS) {
    if (pathname.startsWith(prefix)) {
      const rel = pathname.slice(prefix.length);
      // nunca deixa ../ escapar da pasta pública
      const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
      serveFile(req, res, path.join(dir, safeRel));
      return true;
    }
  }
  return false;
}

function notFound(res) {
  sendHTML(res, 404, '<!doctype html><meta charset="utf-8"><title>404</title><body style="font-family:sans-serif;padding:60px;text-align:center">Página não encontrada. <a href="/">Voltar ao início</a></body>');
}

// ---------- admin: exige sessão ----------

function requireAdminSession(req, res) {
  if (!req.user) {
    if (req.url.startsWith('/api/')) sendJSON(res, 401, { error: 'not_logged_in' });
    else { res.writeHead(302, { Location: '/admin/login' }); res.end(); }
    return false;
  }
  return true;
}

async function handle(req, res) {
  auth.attachUser(req); // lê o cookie de sessão (se houver) — nunca um token no corpo/JS
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method;

  try {
    // ---- healthcheck (para orquestrador de deploy — Railway/Render/etc.) ----
    if (pathname === '/health' && method === 'GET') return sendJSON(res, 200, { ok: true, uptime: process.uptime() });

    // ---- API pública (sem sessão) ----
    if (pathname === '/api/products' && method === 'GET') return publicApi.listProducts(req, res, url.searchParams);
    let m = pathname.match(/^\/api\/products\/slug\/([^/]+)$/);
    if (m && method === 'GET') return publicApi.getProductBySlug(req, res, m[1]);
    if (pathname === '/api/brands' && method === 'GET') return publicApi.listBrands(req, res);

    // ---- API de sessão do admin (login não exige sessão prévia) ----
    if (pathname === '/api/admin/login' && method === 'POST') return await adminApi.login(req, res);
    if (pathname === '/api/admin/logout' && method === 'POST') return adminApi.logout(req, res);
    if (pathname === '/api/admin/me' && method === 'GET') return adminApi.me(req, res);

    // ---- resto do /api/admin/* exige sessão válida ----
    if (pathname.startsWith('/api/admin/')) {
      if (!requireAdminSession(req, res)) return;

      if (pathname === '/api/admin/change-password' && method === 'POST') return await adminApi.changePassword(req, res);
      if (pathname === '/api/admin/products' && method === 'GET') return adminApi.listProducts(req, res, url.searchParams);
      if (pathname === '/api/admin/products' && method === 'POST') return await adminApi.createProduct(req, res);
      if (pathname === '/api/admin/brands' && method === 'GET') return adminApi.listBrands(req, res);
      if (pathname === '/api/admin/brands' && method === 'POST') return await adminApi.createBrand(req, res);
      if (pathname === '/api/admin/olisek/parse' && method === 'POST') return await adminApi.parseOlisekReport(req, res);
      if (pathname === '/api/admin/olisek/link' && method === 'POST') return await adminApi.applyOlisekLink(req, res);

      m = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
      if (m && method === 'GET') return adminApi.getProduct(req, res, m[1]);
      if (m && method === 'PUT') return await adminApi.updateProductFull(req, res, m[1]);
      if (m && method === 'DELETE') return adminApi.despublish(req, res, m[1]);

      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/price$/);
      if (m && method === 'PUT') return await adminApi.setPrice(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/active$/);
      if (m && method === 'PUT') return await adminApi.setActive(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/featured$/);
      if (m && method === 'PUT') return await adminApi.setFeatured(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/stock$/);
      if (m && method === 'PUT') return await adminApi.setStock(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/olisek$/);
      if (m && method === 'PUT') return await adminApi.setOlisekLink(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images$/);
      if (m && method === 'POST') return await adminApi.uploadImage(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/reorder$/);
      if (m && method === 'PUT') return await adminApi.reorderImages(req, res, m[1]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)$/);
      if (m && method === 'DELETE') return adminApi.deleteImage(req, res, m[1], m[2]);
      m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)\/main$/);
      if (m && method === 'PUT') return adminApi.setMainImage(req, res, m[1], m[2]);

      return sendJSON(res, 404, { error: 'not_found' });
    }

    // ---- páginas do admin (HTML) ----
    if (pathname === '/admin' && method === 'GET') { res.writeHead(302, { Location: '/admin/produtos' }); return res.end(); }
    if (pathname === '/admin/login' && method === 'GET') {
      if (req.user) { res.writeHead(302, { Location: '/admin/produtos' }); return res.end(); }
      return adminPages.loginPage(req, res, { error: url.searchParams.get('erro') || undefined });
    }
    if (pathname.startsWith('/admin/')) {
      if (!requireAdminSession(req, res)) return;
      if (req.user.must_change_password && pathname !== '/admin/trocar-senha') {
        res.writeHead(302, { Location: '/admin/trocar-senha' }); return res.end();
      }
      if (pathname === '/admin/trocar-senha' && method === 'GET') return adminPages.changePasswordPage(req, res, req.user);
      if (pathname === '/admin/produtos' && method === 'GET') return adminPages.productsListPage(req, res, req.user, { q: url.searchParams.get('q') || '', filter: url.searchParams.get('filtro') || '' });
      if (pathname === '/admin/produtos/novo' && method === 'GET') {
        if (req.user.role !== 'admin') { res.writeHead(302, { Location: '/admin/produtos' }); return res.end(); }
        const catalogService = require('./services/catalogService');
        return adminPages.productFormPage(req, res, req.user, null, { brands: catalogService.listBrandsAdmin() });
      }
      m = pathname.match(/^\/admin\/produtos\/(\d+)$/);
      if (m && method === 'GET') {
        const catalogService = require('./services/catalogService');
        const product = catalogService.getAdminProductById(Number(m[1]));
        if (!product) return notFound(res);
        if (req.user.role !== 'admin') delete product.priceHistory;
        return adminPages.productFormPage(req, res, req.user, product, { brands: catalogService.listBrandsAdmin() });
      }
      return notFound(res);
    }

    // ---- página de produto pública ----
    m = pathname.match(/^\/produto\/([^/]+)\/?$/);
    if (m && method === 'GET') return productPage.productPage(req, res, m[1]);

    // ---- estáticos (site antigo: index.html, assets/, uploads/) ----
    if (method === 'GET' && tryServeStatic(req, res, pathname)) return;

    return notFound(res);
  } catch (err) {
    console.error(err);
    if (pathname.startsWith('/api/')) sendJSON(res, err.status || 500, { error: 'server_error', message: err.message });
    else sendHTML(res, 500, '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:60px">Erro interno. Tente novamente em instantes.</body>');
  }
}

const server = http.createServer((req, res) => { handle(req, res); });
server.listen(PORT, () => {
  console.log(`Essência Natural (V2) rodando em http://localhost:${PORT}`);
  console.log('Admin: /admin/login — usuário e senha temporária foram gerados por server/seed.js.');
});

// ---------- desligamento gracioso ----------
// Em qualquer plataforma de deploy (Railway, Render, Docker, etc.) o processo
// recebe SIGTERM antes de ser morto na troca de versão. Sem isso, requisições
// em andamento (ex.: um upload de imagem gravando no disco) podem ser
// cortadas no meio. Paramos de aceitar conexões novas e esperamos as atuais
// terminarem, com um teto de segurança para não travar o deploy para sempre.
function gracefulShutdown(signal) {
  console.log(`\n${signal} recebido — encerrando servidor com calma...`);
  server.close(() => {
    console.log('Servidor encerrado. Até a próxima.');
    process.exit(0);
  });
  setTimeout(() => {
    console.warn('Encerramento forçado após 10s (havia conexão presa em aberto).');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
