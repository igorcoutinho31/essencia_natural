'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('sitemap acompanha as páginas públicas e preserva as demais rotas', async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-sitemap-'));
  process.env.STORAGE_DIR = storage;
  process.env.PORT = String(40000 + Math.floor(Math.random() * 20000));
  const db = require('../server/db');
  const server = require('../server/app');
  try {
    if (!server.listening) await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const get = (route, options) => fetch(origin + route, options);
    const insert = db.prepare('INSERT INTO products (slug, name, active, stock, sales) VALUES (?, ?, ?, ?, ?)');
    const base = 'https://www.lojaessencianatural.com.br';
    const locations = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

    assert.deepEqual(locations(await (await get('/sitemap.xml')).text()), [base + '/']);
    insert.run('com-estoque', 'Teste', 1, 1, 0);
    insert.run('dez-vendas', 'Teste', 1, 0, 10);
    insert.run('oculto', 'Teste', 1, 0, 9);
    insert.run('despublicado', 'Teste', 0, 10, 20);
    const specialSlug = 'perfume-é&"\'';
    insert.run(specialSlug, 'Teste', 1, 1, 0);

    const response = await get('/sitemap.xml?q=oculto', { headers: { 'X-Forwarded-Host': 'example.org' } });
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(xml));
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
    assert.deepEqual(locations(xml), [base + '/', base + '/produto/com-estoque', base + '/produto/dez-vendas',
      base + '/produto/' + encodeURIComponent(specialSlug).replace(/'/g, '&apos;')]);
    assert.ok(!xml.includes('/admin'));

    const products = (await (await get('/api/products')).json()).products;
    assert.equal(locations(xml).length, products.length + 1);
    for (const product of products) {
      assert.equal((await get('/produto/' + encodeURIComponent(product.slug))).status, 200);
    }
    for (const slug of ['oculto', 'despublicado']) {
      assert.equal((await get('/produto/' + slug)).status, 404);
    }
    const head = await get('/sitemap.xml', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), response.headers.get('content-length'));

    db.prepare("UPDATE products SET active = 0 WHERE slug = 'com-estoque'").run();
    db.prepare("UPDATE products SET stock = 1 WHERE slug = 'oculto'").run();
    const updated = await (await get('/sitemap.xml')).text();
    assert.ok(!updated.includes('/produto/com-estoque'));
    assert.ok(updated.includes('/produto/oculto'));

    const robots = await (await get('/robots.txt')).text();
    assert.match(robots, /Sitemap: https:\/\/www.lojaessencianatural.com.br\/sitemap.xml/);
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Disallow: \/api\/admin/);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/health')).status, 200);
    assert.equal((await get('/admin/login')).status, 200);
    assert.equal((await get('/api/admin/products')).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    const resolved = path.resolve(storage);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('essencia-sitemap-')) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
});
