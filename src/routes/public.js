// Rotas públicas — só leitura, sem autenticação. Nunca expõem estoque
// numérico nem chamam a OliSek.
import * as catalog from '../services/catalog.js';
import * as team from '../services/team.js';
import { json } from '../http.js';

export const WHATSAPP = '5511949614608';

/** GET /api/products */
export async function listProducts(ctx) {
  const q = ctx.url.searchParams;
  const products = await catalog.getPublicProducts(ctx.db, {
    q: q.get('q') || undefined,
    brand: q.get('brand') || undefined,
    gender: q.get('genero') || q.get('gender') || undefined,
    category: q.get('categoria') || q.get('category') || undefined,
    availability: q.get('disponibilidade') || q.get('availability') || undefined,
    featured: q.get('destaque') || q.get('featured') || undefined,
    sort: q.get('sort') || undefined,
  });
  return json(200, { whatsapp: WHATSAPP, products });
}

/** GET /api/products/slug/:slug */
export async function getProductBySlug(ctx, slug) {
  const page = await catalog.getPublicProductPage(ctx.db, slug, 4);
  if (!page) return json(404, { error: 'not_found' });
  return json(200, { whatsapp: WHATSAPP, product: page.product, related: page.related });
}

/** GET /api/team — primeiro nome e foto de quem está ativo, na ordem do painel. */
export async function listTeam(ctx) {
  return json(200, { team: await team.listPublic(ctx.db) }, { 'Cache-Control': 'public, max-age=60' });
}

/** GET /api/brands */
export async function listBrands(ctx) {
  return json(200, { brands: await catalog.getBrandsPublic(ctx.db) });
}

function escapeXML(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** GET|HEAD /sitemap.xml — mesma seleção da vitrine, consultada a cada
 *  pedido (publicação, estoque e vendas refletem na hora). */
export async function sitemap(ctx) {
  const base = ctx.config.siteUrl;
  const entries = [
    { loc: base + '/' },
    { loc: base + '/links' },
    ...(await catalog.getPublicProducts(ctx.db)).map((p) => ({
      loc: `${base}/produto/${encodeURIComponent(p.slug)}`,
      lastmod: p.updatedAt ? String(p.updatedAt).slice(0, 10) : null,
    })),
  ];
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => `  <url><loc>${escapeXML(e.loc)}</loc>${e.lastmod ? `<lastmod>${escapeXML(e.lastmod)}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  const bytes = new TextEncoder().encode(body);
  return new Response(ctx.request.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
