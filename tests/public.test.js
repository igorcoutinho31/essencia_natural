import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, ORIGIN } from './helpers.js';

const locations = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

test('sitemap acompanha as páginas públicas (só o que está publicado)', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const fixas = [ORIGIN + '/', ORIGIN + '/links'];

  assert.deepEqual(locations(await (await app.call('/sitemap.xml')).text()), fixas);
  await app.insertProduct({ slug: 'com-estoque', stock: 1 });
  await app.insertProduct({ slug: 'zerado-publicado', stock: 0, sales: 0 });
  await app.insertProduct({ slug: 'oculto', active: 0, stock: 10, sales: 20 });
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
  assert.deepEqual(locations(xml), [...fixas, ORIGIN + '/produto/com-estoque', ORIGIN + '/produto/zerado-publicado',
    ORIGIN + '/produto/' + encodeURIComponent(especial).replace(/'/g, '&apos;')]);
  assert.ok(!xml.includes('/admin'));

  const products = (await (await app.call('/api/products')).json()).products;
  assert.equal(locations(xml).length, products.length + fixas.length);
  for (const p of products) assert.equal((await app.call('/produto/' + encodeURIComponent(p.slug))).status, 200);
  assert.equal((await app.call('/produto/oculto')).status, 404);

  const head = await app.call('/sitemap.xml', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  // Publicar/ocultar no admin reflete na hora.
  await app.db.prepare("UPDATE products SET active = 0 WHERE slug = 'com-estoque'").run();
  await app.db.prepare("UPDATE products SET active = 1 WHERE slug = 'oculto'").run();
  const novo = await (await app.call('/sitemap.xml')).text();
  assert.ok(!novo.includes('/produto/com-estoque'));
  assert.ok(novo.includes('/produto/oculto'));
});

test('API pública: sempre "Consulte disponibilidade", sem estoque numérico', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'a', name: 'Âmbar', stock: 50, price: 199.9 });
  await app.insertProduct({ slug: 'b', name: 'Baunilha', stock: 3 });
  await app.insertProduct({ slug: 'c', name: 'Cedro', stock: 0, sales: 0 });
  await app.insertProduct({ slug: 'd', name: 'Damasco', stock: 99, active: 0 });

  const { products, whatsapp } = await (await app.call('/api/products')).json();
  assert.equal(whatsapp, '5511949614608');
  assert.deepEqual(products.map((p) => p.slug), ['a', 'b', 'c'], 'só os publicados, com ou sem estoque');
  for (const p of products) {
    assert.equal(p.stockStatus, 'consulte');
    assert.equal(p.stockLabel, 'Consulte disponibilidade');
    assert.ok(!('stock' in p) && !('sales' in p));
  }

  const busca = (await (await app.call('/api/products?q=ambar')).json()).products;
  assert.deepEqual(busca.map((p) => p.slug), ['a']);
  const caro = (await (await app.call('/api/products?sort=price_desc')).json()).products;
  assert.equal(caro[0].slug, 'a');

  const one = await (await app.call('/api/products/slug/c')).json();
  assert.equal(one.product.slug, 'c');
  assert.ok(Array.isArray(one.related));
  assert.equal((await app.call('/api/products/slug/d')).status, 404);
  assert.equal((await app.call('/api/products/slug/nao-existe')).status, 404);

  // Página de produto: selo "Consulte" e botão da sacola liberado mesmo com estoque 0.
  const html = await (await app.call('/produto/c')).text();
  assert.match(html, /pd-selo--consulte">Consulte disponibilidade</);
  assert.match(html, /id="pd-add" >\s*Adicionar à sacola/);
  assert.ok(!/schema\.org\/(InStock|OutOfStock|LimitedAvailability)/.test(html), 'não afirma disponibilidade ao Google');
});

test('marcas com requires_product só aparecem com produto publicado', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const marca = async (name, slug, req) => (await app.db.prepare('INSERT INTO brands (name, slug, requires_product) VALUES (?, ?, ?)').bind(name, slug, req).run()).meta.last_row_id;
  await marca('Sempre', 'sempre', 0);
  const nova = await marca('Nova', 'nova', 1);
  const nomes = async () => (await (await app.call('/api/brands')).json()).brands.map((b) => b.name);
  assert.deepEqual(await nomes(), ['Sempre']);
  await app.insertProduct({ slug: 'x', stock: 0, brandId: nova, active: 0 });
  assert.deepEqual(await nomes(), ['Sempre']);
  await app.db.prepare("UPDATE products SET active = 1 WHERE slug = 'x'").run();
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

test('app (PWA): manifesto, service worker e página offline', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const man = await app.call('/manifest.webmanifest');
  assert.equal(man.status, 200);
  assert.match(man.headers.get('content-type'), /manifest\+json/);
  const m = JSON.parse(await man.text());
  assert.equal(m.display, 'standalone');
  assert.deepEqual(m.icons.map((i) => i.sizes), ['192x192', '512x512']);
  for (const i of m.icons) assert.equal((await app.call(i.src)).status, 200, i.src);
  assert.equal((await app.call('/sw.js')).status, 200);
  assert.equal((await app.call('/offline.html')).status, 200);
  const home = await (await app.call('/')).text();
  assert.match(home, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(home, /assets\/js\/app\.js/);
});

test('mais vendidos: a API dá só a posição, nunca a quantidade vendida', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'pouco', sales: 3 });
  await app.insertProduct({ slug: 'campeao', sales: 40 });
  await app.insertProduct({ slug: 'sem-venda', sales: 0 });
  await app.insertProduct({ slug: 'oculto-vende', active: 0, sales: 99 });
  const { products } = await (await app.call('/api/products')).json();
  const rank = Object.fromEntries(products.map((p) => [p.slug, p.salesRank]));
  assert.deepEqual(rank, { pouco: 2, campeao: 1, 'sem-venda': null }, 'oculto não entra no ranking');
  assert.ok(products.every((p) => !('sales' in p) && !('stock' in p)), 'quantidade vendida e estoque não saem');
  const ordem = (await (await app.call('/api/products?sort=vendidos')).json()).products.map((p) => p.slug);
  assert.deepEqual(ordem, ['campeao', 'pouco']);
});

test('home nova: seções, scripts e nada de produto escrito à mão', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const home = await (await app.call('/')).text();
  for (const id of ['hero', 'marcas', 'destaques', 'mais-vendidos', 'catalogo', 'cat-familias', 'canais', 'loja', 'equipe', 'faq']) {
    assert.match(home, new RegExp(`id="${id}"`), id);
  }
  for (const js of ['catalogo', 'home', 'quiz', 'marcas', 'sacola', 'atendimento']) assert.match(home, new RegExp(`assets/js/${js}\\.js`));
  assert.ok(!/<script>(?!\s*<\/script>)/.test(home), 'home sem <script> inline');
  assert.ok(!/<style>/.test(home), 'home sem <style> inline');
  assert.equal((await app.call('/assets/brands/ouro/lattafa.png')).status, 200, 'logos em dourado');
});

test('Google: trilha sempre, ficha de produto só com preço e foto no sitemap', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const marca = (await app.db.prepare("INSERT INTO brands (name, slug) VALUES ('Lattafa', 'lattafa')").run()).meta.last_row_id;
  const sem = await app.insertProduct({ slug: 'sem-preco', name: 'Khamrah', brandId: marca });
  await app.insertProduct({ slug: 'com-preco', name: 'Yara', brandId: marca, price: 199.9 });
  app.db.raw.exec(`INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (${sem}, '/uploads/biblioteca/abc-hd.webp', 0, 1, 1)`);
  const blocos = async (slug) => [...(await (await app.call('/produto/' + slug)).text()).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

  const a = await blocos('sem-preco');
  assert.deepEqual(a.map((s) => s['@type']), ['BreadcrumbList'], 'sem preço não há ficha de produto (o Google acusaria erro)');
  assert.deepEqual(a[0].itemListElement.map((i) => i.name), ['Catálogo', 'Lattafa', 'Khamrah']);
  assert.equal(a[0].itemListElement[1].item, ORIGIN + '/?marca=lattafa#catalogo');

  const b = await blocos('com-preco');
  const ficha = b.find((s) => s['@type'] === 'Product');
  assert.equal(ficha.offers.price, '199.90');
  assert.equal(ficha.offers.priceCurrency, 'BRL');

  const xml = await (await app.call('/sitemap.xml')).text();
  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml, /<loc>[^<]*\/produto\/sem-preco<\/loc><lastmod>[^<]+<\/lastmod><image:image><image:loc>https:\/\/www\.lojaessencianatural\.com\.br\/uploads\/biblioteca\/abc-hd\.webp<\/image:loc><\/image:image><\/url>/);
  assert.ok(!/com-preco<\/loc>(<lastmod>[^<]+<\/lastmod>)?<image:image>/.test(xml), 'sem foto real, sem imagem no sitemap');
});

test('equipe: Ali entra com foto pela migração', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const team = (await (await app.call('/api/team')).json()).team;
  const ali = team.find((m) => m.name === 'Ali');
  assert.ok(ali, 'Ali aparece na equipe');
  assert.equal(ali.photo, '/assets/team/ali.webp');
  assert.equal((await app.call('/assets/team/ali.webp')).status, 200);
});

test('cache na borda: público fica guardado, painel e foto privada não', async (t) => {
  const { handle, regraBorda } = await import('../src/app.js');
  assert.equal(regraBorda('/api/products'), 60);
  assert.equal(regraBorda('/produto/x'), 60);
  assert.equal(regraBorda('/uploads/products/x/a.webp'), 'resposta');
  assert.equal(regraBorda('/api/admin/products'), null);
  assert.equal(regraBorda('/admin/loja'), null);

  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'p1', name: 'P1' });
  const guardado = new Map();
  const cache = { match: async (k) => (guardado.has(k) ? guardado.get(k).clone() : undefined), put: async (k, r) => { guardado.set(k, r); } };
  const deps = { ...app.deps, cache };
  const pedir = (p) => handle(new Request(ORIGIN + p), deps);

  let r = await pedir('/api/products');
  assert.equal(r.status, 200);
  assert.ok(guardado.has(ORIGIN + '/api/products'), 'catálogo guardado na borda');
  assert.equal(guardado.get(ORIGIN + '/api/products').headers.get('Cache-Control'), 'public, max-age=60');
  // a segunda vez vem da borda, sem passar pelo banco
  app.db.raw.exec("UPDATE products SET name = 'Mudou' WHERE slug = 'p1'");
  r = await pedir('/api/products');
  assert.equal((await r.json()).products[0].name, 'P1');

  await pedir('/api/admin/products');
  await pedir('/admin/loja');
  assert.ok(![...guardado.keys()].some((k) => k.includes('/admin')), 'painel nunca vai para a borda');
  await pedir('/uploads/nao-existe.webp');
  assert.ok(!guardado.has(ORIGIN + '/uploads/nao-existe.webp'), 'só resposta 200');
});
