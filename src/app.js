// Roteador do site — recebe um Request e devolve um Response (padrão Web).
// É o mesmo código no Worker da Cloudflare (src/worker.js) e no servidor
// Node local (server/app.js); só muda o que vem em `deps`:
//   db       API do D1 (binding D1 / server/sqlite-d1.js)
//   storage  fotos enviadas (R2 / pasta uploads/) — ver src/storage.js
//   assets   arquivos estáticos (binding ASSETS / server/static.js)
//   images   binding de Images da Cloudflare (opcional)
//   config   ver configFromEnv() abaixo
//   clientIp IP de quem fez o pedido (limite de tentativas de login)
import * as auth from './auth.js';
import * as catalog from './services/catalog.js';
import * as inventory from './services/inventory.js';
import * as olisek from './services/olisek.js';
import { listSnapshots } from './services/autoBackup.js';
import * as publicRoutes from './routes/public.js';
import { productPage } from './routes/productPage.js';
import * as adminApi from './routes/adminApi.js';
import * as adminPages from './routes/adminPages.js';
import { HttpError, json, html, redirect, notFoundPage, withSecurityHeaders } from './http.js';

export const DEFAULT_SITE_URL = 'https://www.lojaessencianatural.com.br';

/** Lê a configuração das variáveis de ambiente (vars/secrets do Worker ou
 *  process.env no Node). */
export function configFromEnv(env = {}) {
  const siteUrl = String(env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
  let canonicalHost = '';
  try { canonicalHost = new URL(siteUrl).hostname; } catch { /* SITE_URL inválida: sem redirecionamento */ }
  return {
    siteUrl,
    canonicalHost,
    // Domínio sem "www" redireciona (301) para o endereço oficial.
    redirectHosts: canonicalHost.startsWith('www.') ? [canonicalHost.slice(4)] : [],
    olisekApiUrl: env.OLISEK_API_URL || '',
    olisekLogin: env.OLISEK_LOGIN || '',
    olisekPassword: env.OLISEK_PASSWORD || '',
    olisekAutoSync: env.OLISEK_AUTO_SYNC === '1',
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Proteção contra CSRF nas rotas que mudam dados do admin: o pedido tem de
 *  vir do próprio site (cabeçalho Origin, que o navegador sempre manda em
 *  POST/PUT/DELETE e que uma página de terceiros não consegue forjar). */
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  // Compara só o host: atrás de um proxy que termina o HTTPS (Node local /
  // Railway) o esquema visto pelo servidor pode ser http.
  if (origin) { try { return new URL(origin).host === url.host; } catch { return false; } }
  const site = request.headers.get('sec-fetch-site');
  return !site || site === 'same-origin' || site === 'none';
}

function requireSession(ctx) {
  if (ctx.user) return null;
  if (ctx.pathname.startsWith('/api/')) return json(401, { error: 'not_logged_in' });
  return redirect('/admin/login');
}

/** Fotos da biblioteca de fornecedores (`biblioteca/...`) só saem para o
 *  público quando a loja liberou o uso e o produto está publicado; antes
 *  disso, só quem está logado no /admin vê (ver migrations/0005). */
async function libraryPhotoAccess(ctx, key) {
  const liberada = await ctx.db.prepare(
    `SELECT 1 AS x FROM product_images pi JOIN products p ON p.id = pi.product_id
      WHERE pi.file_path = ? AND pi.licensed = 1 AND p.active = 1 LIMIT 1`
  ).bind('/uploads/' + key).first();
  if (liberada) return 'public';
  const sid = auth.parseCookies(ctx.request.headers.get('cookie'))[auth.SESSION_COOKIE];
  return sid && (await auth.getUserBySession(ctx.db, sid)) ? 'private' : null;
}

async function serveUpload(ctx, key) {
  if (!key || key.includes('..') || key.startsWith('/')) return notFoundPage();
  let acesso = 'public';
  if (key.startsWith('biblioteca/')) {
    acesso = await libraryPhotoAccess(ctx, key);
    if (!acesso) return notFoundPage();
  }
  const obj = await ctx.storage.get(key);
  if (!obj) return notFoundPage();
  const headers = {
    'Content-Type': obj.contentType || 'application/octet-stream',
    // Cada foto enviada ganha um nome novo e nunca é sobrescrita: o
    // navegador guarda por 1 ano e não pede de novo (economiza pedidos ao
    // Worker — o plano grátis tem 100 mil por dia).
    'Cache-Control': acesso === 'private' ? 'private, no-store' : 'public, max-age=31536000, immutable',
  };
  if (obj.etag) {
    headers.ETag = obj.etag;
    if (ctx.request.headers.get('if-none-match') === obj.etag) return new Response(null, { status: 304, headers });
  }
  if (obj.size != null) headers['Content-Length'] = String(obj.size);
  return new Response(ctx.request.method === 'HEAD' ? null : obj.body, { status: 200, headers });
}

function csv(filename, body) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function adminRoutes(ctx) {
  const { pathname, method, db } = ctx;
  let m;

  if (pathname === '/api/admin/login' && method === 'POST') return adminApi.login(ctx);
  if (pathname === '/api/admin/logout' && method === 'POST') return adminApi.logout(ctx);
  if (pathname === '/api/admin/me' && method === 'GET') return adminApi.me(ctx);

  if (pathname.startsWith('/api/admin/')) {
    const deny = requireSession(ctx);
    if (deny) return deny;
    if (pathname === '/api/admin/change-password' && method === 'POST') return adminApi.changePassword(ctx);
    // Com senha temporária, a única coisa liberada é trocá-la.
    if (ctx.user.must_change_password) return json(403, { error: 'must_change_password', message: 'Troque a senha temporária primeiro.' });
    if (pathname === '/api/admin/products' && method === 'GET') return adminApi.listProducts(ctx);
    if (pathname === '/api/admin/products' && method === 'POST') return adminApi.createProduct(ctx);
    if (pathname === '/api/admin/products/bulk' && method === 'POST') return adminApi.bulk(ctx);
    if (pathname === '/api/admin/brands' && method === 'GET') return adminApi.listBrands(ctx);
    if (pathname === '/api/admin/brands' && method === 'POST') return adminApi.createBrand(ctx);
    if (pathname === '/api/admin/olisek/parse' && method === 'POST') return adminApi.parseOlisekReport(ctx);
    if (pathname === '/api/admin/olisek/link' && method === 'POST') return adminApi.applyOlisekLink(ctx);
    if (pathname === '/api/admin/stock' && method === 'GET') return adminApi.stockOverview(ctx);
    if (pathname === '/api/admin/stock/movements' && method === 'GET') return adminApi.listMovements(ctx);
    if (pathname === '/api/admin/stock/olisek-sync' && method === 'POST') return adminApi.syncAllOlisek(ctx);
    if (pathname === '/api/admin/backup' && method === 'GET') return adminApi.backup(ctx);
    m = pathname.match(/^\/api\/admin\/backups\/(\d+)$/);
    if (m && method === 'GET') return adminApi.autoBackupDownload(ctx, m[1]);

    m = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
    if (m && method === 'GET') return adminApi.getProduct(ctx, m[1]);
    if (m && method === 'PUT') return adminApi.updateProductFull(ctx, m[1]);
    if (m && method === 'DELETE') return adminApi.despublish(ctx, m[1]);

    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/(price|active|featured|stock|olisek)$/);
    if (m && method === 'PUT') {
      const fn = { price: adminApi.setPrice, active: adminApi.setActive, featured: adminApi.setFeatured, stock: adminApi.setStock, olisek: adminApi.setOlisekLink }[m[2]];
      return fn(ctx, m[1]);
    }
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/stock\/movements$/);
    if (m && method === 'POST') return adminApi.createMovement(ctx, m[1]);
    if (m && method === 'GET') return adminApi.listMovements(ctx, m[1]);
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/olisek\/sync$/);
    if (m && method === 'POST') return adminApi.syncOlisekStock(ctx, m[1]);
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images$/);
    if (m && method === 'POST') return adminApi.uploadImage(ctx, m[1]);
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/reorder$/);
    if (m && method === 'PUT') return adminApi.reorderImages(ctx, m[1]);
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)$/);
    if (m && method === 'DELETE') return adminApi.deleteImage(ctx, m[1], m[2]);
    m = pathname.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)\/main$/);
    if (m && method === 'PUT') return adminApi.setMainImage(ctx, m[1], m[2]);

    return json(404, { error: 'not_found' });
  }

  // ---- páginas do admin (HTML) ----
  if (pathname === '/admin' || pathname === '/admin/') return redirect('/admin/produtos');
  if (pathname === '/admin/login' && method === 'GET') {
    if (ctx.user) return redirect('/admin/produtos');
    return adminPages.loginPage({ error: (ctx.url.searchParams.get('erro') || '').slice(0, 200) || undefined });
  }
  if (!pathname.startsWith('/admin/') || method !== 'GET') return null;
  const deny = requireSession(ctx);
  if (deny) return deny;
  const user = ctx.user;
  if (user.must_change_password && pathname !== '/admin/trocar-senha') return redirect('/admin/trocar-senha');
  if (pathname === '/admin/trocar-senha') return adminPages.changePasswordPage(user);
  if (pathname === '/admin/produtos') {
    const sp = ctx.url.searchParams;
    const q = (sp.get('q') || '').slice(0, 100);
    const filter = sp.get('filtro') || '';
    const filtroAtivo = filter in catalog.ADMIN_FILTERS ? filter : 'todos';
    const brandId = /^\d+$/.test(sp.get('marca') || '') ? sp.get('marca') : '';
    const category = (sp.get('categoria') || '').slice(0, 100);
    const source = ['loja', 'importado'].includes(sp.get('origem')) ? sp.get('origem') : '';
    const pagina = await catalog.getAdminProductsPage(db, {
      q, filter: filtroAtivo, brandId, category, source, page: sp.get('pagina'),
    });
    return adminPages.productsListPage(user, {
      ...pagina, q, filtroAtivo, brandId, category, source,
      brands: await catalog.listBrandsAdmin(db), categories: await catalog.listCategories(db),
    });
  }
  if (pathname === '/admin/fotos') {
    if (user.role !== 'admin') return redirect('/admin/produtos');
    const sp = ctx.url.searchParams;
    const source = ['loja', 'importado'].includes(sp.get('origem')) ? sp.get('origem') : '';
    return adminPages.photoReviewPage(user, { ...(await catalog.getPhotoReviewPage(db, { source, page: sp.get('pagina') })), source });
  }
  if (pathname === '/admin/produtos/novo') {
    if (user.role !== 'admin') return redirect('/admin/produtos');
    return adminPages.productFormPage(user, null, { brands: await catalog.listBrandsAdmin(db), categories: await catalog.listCategories(db) });
  }
  m = pathname.match(/^\/admin\/produtos\/(\d+)$/);
  if (m) {
    const product = await catalog.getAdminProductById(db, Number(m[1]));
    if (!product) return notFoundPage();
    if (user.role !== 'admin') delete product.priceHistory;
    return adminPages.productFormPage(user, product, {
      brands: await catalog.listBrandsAdmin(db),
      categories: await catalog.listCategories(db),
      movements: user.role === 'admin' ? await inventory.listMovements(db, { productId: product.id, limit: 20 }) : [],
      olisekConfigured: olisek.apiConfigured(ctx.config),
    });
  }
  if (pathname.startsWith('/admin/estoque') && user.role !== 'admin') return redirect('/admin/produtos');
  if (pathname === '/admin/estoque') {
    return adminPages.stockPage(user, {
      overview: await inventory.inventoryOverview(db),
      movements: await inventory.listMovements(db, { limit: 50 }),
      filtro: ctx.url.searchParams.get('filtro') || 'todos',
      olisekConfigured: olisek.apiConfigured(ctx.config),
      autoSync: ctx.config.olisekAutoSync,
      snapshots: await listSnapshots(db),
    });
  }
  const hoje = new Date().toISOString().slice(0, 10);
  if (pathname === '/admin/estoque.csv') {
    const { products } = await inventory.inventoryOverview(db);
    return csv(`estoque-${hoje}.csv`, inventory.toCSV(
      ['id', 'produto', 'marca', 'saldo', 'origem', 'id_olisek', 'publicado', 'ultima_movimentacao'],
      products.map((p) => [p.id, p.name, p.brand, p.stock, p.stockSource, p.olisekId, p.active ? 'sim' : 'não', p.lastMovementAt]),
    ));
  }
  if (pathname === '/admin/estoque/movimentacoes.csv') {
    const movs = await inventory.listMovements(db, { limit: 5000 });
    return csv(`movimentacoes-estoque-${hoje}.csv`, inventory.toCSV(
      ['data', 'produto', 'tipo', 'quantidade', 'saldo_antes', 'saldo_depois', 'motivo', 'quem'],
      movs.map((x) => [x.createdAt, x.productName, x.kindLabel, x.quantity, x.stockBefore, x.stockAfter, x.reason, x.userName]),
    ));
  }
  return notFoundPage();
}

async function route(ctx) {
  const { pathname, method } = ctx;
  const leitura = method === 'GET' || method === 'HEAD';

  if (pathname === '/sitemap.xml' && leitura) return publicRoutes.sitemap(ctx);
  if (pathname === '/health' && method === 'GET') return json(200, { ok: true });
  if (pathname === '/favicon.ico' && leitura && ctx.assets) {
    return ctx.assets.fetch(new Request(new URL('/assets/icons/favicon.ico', ctx.url), ctx.request));
  }

  if (pathname === '/api/products' && method === 'GET') return publicRoutes.listProducts(ctx);
  let m = pathname.match(/^\/api\/products\/slug\/([^/]+)$/);
  if (m && method === 'GET') return publicRoutes.getProductBySlug(ctx, m[1]);
  if (pathname === '/api/brands' && method === 'GET') return publicRoutes.listBrands(ctx);

  if (pathname.startsWith('/api/admin/') || pathname === '/admin' || pathname.startsWith('/admin/')) {
    const res = await adminRoutes(ctx);
    if (res) return res;
  }

  m = pathname.match(/^\/produto\/([^/]+)\/?$/);
  if (m && method === 'GET') return productPage(ctx, m[1]);

  if (pathname.startsWith('/uploads/') && leitura) return serveUpload(ctx, pathname.slice('/uploads/'.length));

  if (pathname.startsWith('/api/')) return json(404, { error: 'not_found' });
  if (leitura && ctx.assets) {
    const res = await ctx.assets.fetch(ctx.request);
    if (res.status !== 404) return res;
  }
  return notFoundPage();
}

export async function handle(request, deps) {
  const url = new URL(request.url);
  const https = url.protocol === 'https:';
  const config = deps.config;

  if (config.redirectHosts && config.redirectHosts.includes(url.hostname)) {
    return redirect(config.siteUrl + url.pathname + url.search, 301);
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return withSecurityHeaders(notFoundPage(), { https }); }

  const ctx = {
    ...deps, request, url, pathname, method: request.method, https,
    user: null, sessionId: null,
  };

  let response;
  try {
    const ehAdmin = pathname.startsWith('/api/admin/') || pathname.startsWith('/admin');
    if (ehAdmin) {
      const sid = auth.parseCookies(request.headers.get('cookie'))[auth.SESSION_COOKIE];
      ctx.sessionId = sid || null;
      ctx.user = sid ? await auth.getUserBySession(deps.db, sid) : null;
      if (!SAFE_METHODS.has(request.method) && !sameOrigin(request, url)) {
        throw new HttpError(403, 'cross_origin', 'Pedido de outra origem recusado.');
      }
    }
    response = await route(ctx);
  } catch (err) {
    const status = err instanceof HttpError || (err && Number.isInteger(err.status)) ? err.status : 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? 'Erro interno. Tente novamente em instantes.' : (err.message || 'Erro.');
    response = pathname.startsWith('/api/')
      ? json(status, { error: status >= 500 ? 'server_error' : (err.code || err.message), message })
      : html(status, `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:60px">${status >= 500 ? 'Erro interno. Tente novamente em instantes.' : 'Não foi possível concluir o pedido.'}</body>`);
  }
  if (ctx.pathname.startsWith('/admin') || ctx.pathname.startsWith('/api/admin/')) {
    response = new Response(response.body, response);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store');
    else if (response.headers.get('Cache-Control') === 'no-cache') response.headers.set('Cache-Control', 'no-store');
  }
  return withSecurityHeaders(response, { https });
}
