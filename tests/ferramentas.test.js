// Ferramentas do painel: regras no navegador (regras-catalogo.mjs) e o
// servidor gravando só o que foi aprovado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { mudancasDeNomes, paresDeFotos } from '../public/assets/js/regras-catalogo.mjs';
import * as ferramentas from '../src/services/ferramentas.js';

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

const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const webp = (n = 40) => { const b = new Uint8Array(n); b.set([...Buffer.from('RIFF')], 0); b.set([...Buffer.from('WEBP')], 8); return b; };

test('fotos em alta: só endereços dos fornecedores conhecidos', () => {
  const ok = ['https://media-n.atlanticostor.com.br/atlantico/integrations/x/y.webp', 'https://s3.amazonaws.com/tiny-anexos-us/erp/a/b.jpg'];
  const nao = ['http://media-n.atlanticostor.com.br/a.webp', 'https://s3.amazonaws.com/outro-bucket/a.jpg', 'https://evil.com/a.webp',
    'https://user:x@media-n.atlanticostor.com.br/a.webp', 'https://media-n.atlanticostor.com.br:8443/a.webp', 'https://169.254.169.254/latest', 'nada'];
  ok.forEach((u) => assert.equal(ferramentas.urlOrigemValida(u), true, u));
  nao.forEach((u) => assert.equal(ferramentas.urlOrigemValida(u), false, u));
});

test('fotos em alta: busca do original só por sha guardado', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await ferramentas.gravarOrigens(app.db, [{ sha: SHA_A, url: 'https://s3.amazonaws.com/tiny-anexos-us/erp/a.jpg' }]);
  const pedidos = [];
  const falso = async (url, init) => { pedidos.push([url, init.redirect]); return new Response(webp(), { status: 200 }); };
  assert.deepEqual(await ferramentas.baixarOriginal(app.db, SHA_B, falso), { erro: 'sem_origem' });
  assert.deepEqual(await ferramentas.baixarOriginal(app.db, '../x', falso), { erro: 'sha_invalido' });
  const r = await ferramentas.baixarOriginal(app.db, SHA_A, falso);
  assert.equal(r.contentType, 'image/webp');
  assert.deepEqual(pedidos, [['https://s3.amazonaws.com/tiny-anexos-us/erp/a.jpg', 'manual']]);
  const html = async () => new Response('<html>', { status: 200 });
  assert.deepEqual(await ferramentas.baixarOriginal(app.db, SHA_A, html), { erro: 'nao_e_imagem' });
  const redir = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
  assert.deepEqual(await ferramentas.baixarOriginal(app.db, SHA_A, redir), { erro: 'fornecedor_302' });
});

test('ferramentas: vitrine e fotos em alta pela API', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const loja = await app.insertProduct({ slug: 'loja', name: 'Da Loja', active: 1 });
  const entra = await app.insertProduct({ slug: 'entra', name: 'Entra', active: 0 });
  const semFoto = await app.insertProduct({ slug: 'sem-foto', name: 'Sem Foto', active: 0 });
  const sai = await app.insertProduct({ slug: 'sai', name: 'Sai', active: 1 });
  const fica = await app.insertProduct({ slug: 'fica', name: 'Fica', active: 1 });
  app.db.raw.exec(`UPDATE products SET source = 'onuh', source_id = 'onuh:' || id WHERE id IN (${entra}, ${semFoto}, ${sai}, ${fica});
    UPDATE products SET in_store_report = 1 WHERE id IN (${entra}, ${semFoto}, ${fica});
    INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES
      (${entra}, '/uploads/biblioteca/${SHA_A}.webp', 0, 1, 1), (${fica}, '/uploads/biblioteca/${SHA_A}.webp', 0, 1, 1),
      (${sai}, '/uploads/biblioteca/${SHA_B}.webp', 0, 1, 1), (${loja}, '/uploads/products/loja/x.webp', 0, 1, 1);`);

  await app.login('ana');
  for (const [p, m] of [['/api/admin/ferramentas/vitrine', 'GET'], ['/api/admin/ferramentas/hd', 'GET'], ['/api/admin/ferramentas/hd/original?sha=' + SHA_A, 'GET']]) {
    assert.equal((await app.call(p, { method: m })).status, 403, p);
  }
  assert.equal((await app.call('/api/admin/ferramentas/hd?sha=' + SHA_A, { method: 'POST', body: webp() })).status, 403);
  app.logout();
  await app.login();

  const previa = await (await app.call('/api/admin/ferramentas/vitrine')).json();
  assert.equal(previa.publicados, 3);
  assert.deepEqual([previa.publicar.total, previa.ocultar.total, previa.semFoto], [1, 1, 1]);
  assert.deepEqual(previa.publicar.exemplos.map((x) => x.id), [entra]);
  assert.deepEqual(previa.ocultar.exemplos.map((x) => x.id), [sai]);
  assert.equal((await app.call('/api/admin/ferramentas/vitrine', { method: 'POST', body: {} })).status, 400);
  assert.deepEqual(await (await app.call('/api/admin/ferramentas/vitrine', { method: 'POST', body: { publicar: true, ocultar: true } })).json(), { publicados: 1, ocultados: 1 });
  const ativos = app.db.raw.prepare('SELECT id FROM products WHERE active = 1 ORDER BY id').all().map((r) => r.id);
  assert.deepEqual(ativos, [loja, entra, fica], 'cadastro da loja não muda; sai o importado fora do relatório');

  // origens: só o que for válido é guardado
  let r = await app.call('/api/admin/ferramentas/origens', { method: 'POST', body: { itens: [
    { sha: SHA_A, url: 'https://s3.amazonaws.com/tiny-anexos-us/erp/a.jpg' },
    { sha: SHA_B, url: 'https://evil.com/b.jpg' }, { sha: 'x', url: 'https://s3.amazonaws.com/tiny-anexos-us/c.jpg' }] } });
  assert.deepEqual(await r.json(), { gravadas: 1, ignoradas: 2 });
  const lista = await (await app.call('/api/admin/ferramentas/hd')).json();
  assert.equal(lista.origens, 1);
  assert.deepEqual(lista.fotos.map((f) => [f.sha, f.produtos]), [[SHA_A, 2]]);
  assert.equal((await app.call('/api/admin/ferramentas/hd/original?sha=' + SHA_B)).status, 404);

  // gravar: só webp/jpeg de uma foto que existe; troca em todos os produtos que a usam
  assert.equal((await app.call('/api/admin/ferramentas/hd?sha=' + SHA_A, { method: 'POST', body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) })).status, 400);
  assert.equal((await app.call('/api/admin/ferramentas/hd?sha=' + 'c'.repeat(64), { method: 'POST', body: webp() })).status, 404);
  r = await app.call('/api/admin/ferramentas/hd?sha=' + SHA_A, { method: 'POST', body: webp() });
  assert.deepEqual(await r.json(), { image: `/uploads/biblioteca/${SHA_A}-hd.webp`, produtos: 2 });
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM product_images WHERE file_path = ?').get(`/uploads/biblioteca/${SHA_A}-hd.webp`).n, 2);
  assert.ok(app.db.raw.prepare('SELECT 1 FROM upload_trash WHERE key = ?').get(`biblioteca/${SHA_A}.webp`), 'a pequena vai para a lixeira');
  assert.equal((await (await app.call('/api/admin/ferramentas/hd')).json()).fotos.length, 0, 'não aparece de novo');
  const publico = (await (await app.call('/api/products')).json()).products.find((p) => p.slug === 'fica');
  assert.equal(publico.image, `/uploads/biblioteca/${SHA_A}-hd.webp`);
});
