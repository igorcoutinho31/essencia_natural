// Ferramentas do painel: regras no navegador (regras-catalogo.mjs) e o
// servidor gravando só o que foi aprovado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { mudancasDeNomes, paresDeFotos } from '../public/assets/js/regras-catalogo.mjs';

test('regras: nomes a arrumar e pares de fotos', () => {
  const nomes = mudancasDeNomes([
    { id: 1, name: 'AL WATANIAH EQAAB EDP H 100ML', brand: 'Al Wataniah', volume: null, concentration: null },
    { id: 2, name: 'Sabah Al Ward', brand: 'Al Wataniah', volume: '100 ml', concentration: 'EDP' },
  ]);
  assert.deepEqual(nomes.map((m) => [m.id, m.depois]), [[1, { name: 'Eqaab', volume: '100 ml', concentration: 'EDP' }]]);

  const { pares, semPar } = paresDeFotos([
    { id: 1, name: 'KHAMARAH', brand: null, source: null, image: '/uploads/products/k/old.webp', hasImage: true },
    { id: 2, name: 'Fakhar Gold', brand: 'Lattafa', source: null, image: '/uploads/products/f/old.webp', hasImage: true },
    { id: 3, name: 'Só da Loja', brand: null, source: null, image: null, hasImage: false },
    { id: 10, name: 'Khamrah', brand: 'Lattafa', source: 'onuh', image: '/uploads/biblioteca/k.webp', hasImage: true },
    { id: 11, name: 'Lattafa Fakhar Gold EDP 100 ml', brand: 'Lattafa', source: 'onuh', image: '/uploads/biblioteca/f.webp', hasImage: true },
    { id: 12, name: 'Sem Foto', brand: 'Lattafa', source: 'onuh', image: null, hasImage: false },
  ]);
  assert.deepEqual(pares.map((p) => [p.id, p.de, p.exato]), [[1, 10, false], [2, 11, true]]);
  assert.deepEqual(semPar.map((p) => p.id), [3]);
  const feito = paresDeFotos([
    { id: 2, name: 'Fakhar Gold', brand: 'Lattafa', source: null, image: '/uploads/biblioteca/f.webp', hasImage: true },
    { id: 11, name: 'Fakhar Gold', brand: 'Lattafa', source: 'onuh', image: '/uploads/biblioteca/f.webp', hasImage: true },
  ]);
  assert.equal(feito.pares.length, 0, 'já padronizado não aparece de novo');
});

test('ferramentas: lista paginada, nomes e fotos gravados com validação', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const loja = await app.insertProduct({ slug: 'khamarah', name: 'KHAMARAH' });
  const imp = await app.insertProduct({ slug: 'khamrah-imp', name: 'Khamrah', active: 0 });
  app.db.raw.exec(`UPDATE products SET source = 'onuh', source_id = 'onuh:1' WHERE id = ${imp};
    INSERT INTO product_images (product_id, file_path, sort_order, is_main) VALUES (${loja}, '/uploads/products/khamarah/old.webp', 0, 1);
    INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (${imp}, '/uploads/biblioteca/k.webp', 0, 1, 1);`);

  await app.login('ana');
  assert.equal((await app.call('/api/admin/ferramentas/produtos')).status, 403, 'vendedora não usa as ferramentas');
  assert.equal((await app.call('/admin/ferramentas')).status, 302);
  app.logout();

  await app.login();
  assert.match(await (await app.call('/admin/ferramentas')).text(), /regras-catalogo\.mjs/);
  const { produtos, fim } = await (await app.call('/api/admin/ferramentas/produtos')).json();
  assert.equal(fim, true);
  assert.deepEqual(produtos.map((p) => [p.id, p.source, p.image]), [[loja, null, '/uploads/products/khamarah/old.webp'], [imp, 'onuh', '/uploads/biblioteca/k.webp']]);
  assert.equal((await (await app.call(`/api/admin/ferramentas/produtos?depois=${loja}`)).json()).produtos.length, 1);

  let r = await app.call('/api/admin/ferramentas/nomes', { method: 'POST', body: { mudancas: [{ id: loja, name: 'Khamarah', volume: '100 ml', concentration: 'EDP' }] } });
  assert.deepEqual(await r.json(), { alterados: 1 });
  assert.equal((await app.call('/api/admin/ferramentas/nomes', { method: 'POST', body: { mudancas: [{ id: loja, name: '' }] } })).status, 400);
  assert.equal((await app.call('/api/admin/ferramentas/nomes', { method: 'POST', body: { mudancas: [] } })).status, 400);

  // foto: só cadastro da loja recebe foto de produto importado
  r = await app.call('/api/admin/ferramentas/fotos', { method: 'POST', body: { pares: [{ id: imp, de: loja }] } });
  assert.deepEqual(await r.json(), { trocados: 0 });
  r = await app.call('/api/admin/ferramentas/fotos', { method: 'POST', body: { pares: [{ id: loja, de: imp }] } });
  assert.deepEqual(await r.json(), { trocados: 1 });
  const imgs = app.db.raw.prepare('SELECT file_path, licensed FROM product_images WHERE product_id = ?').all(loja).map((x) => ({ ...x }));
  assert.deepEqual(imgs, [{ file_path: '/uploads/biblioteca/k.webp', licensed: 1 }]);
  assert.equal(app.db.raw.prepare("SELECT COUNT(*) AS n FROM upload_trash WHERE key = 'products/khamarah/old.webp'").get().n, 1, 'antiga vai para a lixeira');
  const pub = (await (await app.call('/api/products')).json()).products.find((p) => p.slug === 'khamarah');
  assert.equal(pub.name, 'Khamarah');
  assert.equal(pub.image, '/uploads/biblioteca/k.webp');
});
