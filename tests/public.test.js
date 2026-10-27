import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, ORIGIN } from './helpers.js';

const locations = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

test('sitemap acompanha as páginas públicas', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const fixas = [ORIGIN + '/', ORIGIN + '/links'];

  assert.deepEqual(locations(await (await app.call('/sitemap.xml')).text()), fixas);
  await app.insertProduct({ slug: 'com-estoque', stock: 1 });
  await app.insertProduct({ slug: 'dez-vendas', stock: 0, sales: 10 });
  await app.insertProduct({ slug: 'oculto', stock: 0, sales: 9 });
  await app.insertProduct({ slug: 'despublicado', active: 0, stock: 10, sales: 20 });
  const especial = 'perfume-é&"\'';
  await app.insertProduct({ slug: especial, stock: 1 });

  const res = await app.call('/sitemap.xml?q=oculto');
  const xml = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(xml));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.deepEqual(locations(xml), [...fixas, ORIGIN + '/produto/com-estoque', ORIGIN + '/produto/dez-vendas',
    ORIGIN + '/produto/' + encodeURIComponent(especial).replace(/'/g, '&apos;')]);
  assert.ok(!xml.includes('/admin'));

  const products = (await (await app.call('/api/products')).json()).products;
  assert.equal(locations(xml).length, products.length + fixas.length);
  for (const p of products) assert.equal((await app.call('/produto/' + encodeURIComponent(p.slug))).status, 200);
  for (const slug of ['oculto', 'despublicado']) assert.equal((await app.call('/produto/' + slug)).status, 404);

  const head = await app.call('/sitemap.xml', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  await app.db.prepare("UPDATE products SET active = 0 WHERE slug = 'com-estoque'").run();
  await app.db.prepare("UPDATE products SET stock = 1 WHERE slug = 'oculto'").run();
  const novo = await (await app.call('/sitemap.xml')).text();
  assert.ok(!novo.includes('/produto/com-estoque'));
  assert.ok(novo.includes('/produto/oculto'));
});

test('API pública nunca expõe estoque numérico e respeita filtros', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'a', name: 'Âmbar', stock: 50, price: 199.9 });
  await app.insertProduct({ slug: 'b', name: 'Baunilha', stock: 3 });
  await app.insertProduct({ slug: 'c', name: 'Cedro', stock: 0, sales: 12 });

  const { products, whatsapp } = await (await app.call('/api/products')).json();
  assert.equal(whatsapp, '5511949614608');
  assert.deepEqual(products.map((p) => [p.slug, p.stockStatus]), [['a', 'em_estoque'], ['b', 'ultimas'], ['c', 'indisponivel']]);
  for (const p of products) assert.ok(!('stock' in p) && !('sales' in p));

  const busca = (await (await app.call('/api/products?q=ambar')).json()).products;
  assert.deepEqual(busca.map((p) => p.slug), ['a']);
  const caro = (await (await app.call('/api/products?sort=price_desc')).json()).products;
  assert.equal(caro[0].slug, 'a');

  const one = await (await app.call('/api/products/slug/b')).json();
  assert.equal(one.product.slug, 'b');
  assert.ok(Array.isArray(one.related));
  assert.equal((await app.call('/api/products/slug/nao-existe')).status, 404);
});

test('marcas com requires_product só aparecem com produto visível', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const marca = async (name, slug, req) => (await app.db.prepare('INSERT INTO brands (name, slug, requires_product) VALUES (?, ?, ?)').bind(name, slug, req).run()).meta.last_row_id;
  await marca('Sempre', 'sempre', 0);
  const nova = await marca('Nova', 'nova', 1);
  const nomes = async () => (await (await app.call('/api/brands')).json()).brands.map((b) => b.name);
  assert.deepEqual(await nomes(), ['Sempre']);
  await app.insertProduct({ slug: 'x', stock: 0, brandId: nova });
  assert.deepEqual(await nomes(), ['Sempre']);
  await app.db.prepare("UPDATE products SET stock = 2 WHERE slug = 'x'").run();
  assert.deepEqual(await nomes(), ['Nova', 'Sempre']);
});

test('página de produto: SEO com domínio oficial e JSON seguro no <script>', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'perigoso', name: 'Teste </script><script>alert(1)</script>', stock: 5, price: 10 });
  const html = await (await app.call('/produto/perigoso')).text();
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.lojaessencianatural\.com\.br\/produto\/perigoso">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.lojaessencianatural\.com\.br\/assets\/social\/og-essencia-natural\.jpg">/);
  assert.match(html, /"url":"https:\/\/www\.lojaessencianatural\.com\.br\/produto\/perigoso"/);
  assert.match(html, /"price":"10.00"/);
  assert.ok(!html.includes('</script><script>alert(1)'), 'nome do produto fechou a tag <script>');
});

test('arquivos estáticos e rotas internas', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  assert.equal((await app.call('/')).status, 200);
  assert.equal((await app.call('/links')).status, 200);
  assert.equal((await app.call('/favicon.ico')).status, 200);
  assert.equal((await app.call('/health')).status, 200);
  const robots = await (await app.call('/robots.txt')).text();
  assert.match(robots, /Sitemap: https:\/\/www.lojaessencianatural.com.br\/sitemap.xml/);
  assert.match(robots, /Disallow: \/admin/);
  for (const p of ['/_headers', '/../package.json', '/nao-existe', '/uploads/../server/app.js']) {
    assert.equal((await app.call(p)).status, 404, p);
  }
  assert.equal((await app.call('/api/nao-existe')).status, 404);
});
