// Fotos em alta automáticas (cron): sem painel, as fotos dos produtos
// publicados viram a melhor versão do original do fornecedor.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createTestApp } from './helpers.js';
import { dimensoes, melhorarFotosPublicadas } from '../src/services/fotosAuto.js';
import * as ferramentas from '../src/services/ferramentas.js';

const img = (fmt, w, h, opts = {}) => sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })[fmt](opts).toBuffer().then((b) => new Uint8Array(b));

test('dimensões lidas do cabeçalho (PNG, JPEG, WEBP)', async () => {
  assert.deepEqual(dimensoes(await img('png', 1500, 900)), { w: 1500, h: 900 });
  assert.deepEqual(dimensoes(await img('jpeg', 640, 480)), { w: 640, h: 480 });
  assert.deepEqual(dimensoes(await img('webp', 500, 425)), { w: 500, h: 425 });
  assert.deepEqual(dimensoes(await img('webp', 300, 200, { lossless: true })), { w: 300, h: 200 });
  assert.equal(dimensoes(new Uint8Array([1, 2, 3])), null);
});

test('cron: melhora só as fotos de produtos publicados, uma vez cada', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const S = (c) => c.repeat(64);
  const pub1 = await app.insertProduct({ slug: 'grande', active: 1 });
  const pub2 = await app.insertProduct({ slug: 'mesmo', active: 1 });
  const pub3 = await app.insertProduct({ slug: 'ja-boa', active: 1 });
  const oculto = await app.insertProduct({ slug: 'oculto', active: 0 });
  const pequena = await img('webp', 500, 500, { quality: 40 });
  for (const [id, sha] of [[pub1, S('a')], [pub2, S('b')], [pub3, S('c')], [oculto, S('d')]]) {
    app.db.raw.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (?, ?, 0, 1, 1)').run(id, `/uploads/biblioteca/${sha}.webp`);
    app.db.raw.prepare("INSERT INTO uploads (key, content_type, size, etag, chunks) VALUES (?, 'image/webp', ?, 'x', 1)").run(`biblioteca/${sha}.webp`, pequena.length);
    await ferramentas.gravarOrigens(app.db, [{ sha, url: `https://s3.amazonaws.com/tiny-anexos-us/${sha}` }]);
  }
  const originais = {
    [S('a')]: await img('png', 2000, 2000),                 // grande: precisa reduzir
    [S('b')]: await img('webp', 500, 500, { quality: 95 }), // mesmo tamanho, mais nítida
    [S('c')]: pequena,                                       // igual à guardada
    [S('d')]: await img('png', 2000, 2000),
  };
  const pedidos = [];
  const fetchFn = async (url) => { const sha = url.split('/').pop(); pedidos.push(sha); return new Response(originais[sha], { status: 200 }); };
  const images = { input: () => ({ transform: () => ({ output: () => ({ response: () => new Response(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), 1, 2, 3])) }) }) }) };

  const r = await melhorarFotosPublicadas(app.db, app.deps.storage, images, { limite: 10, fetchFn });
  assert.deepEqual(r, { ok: 2, igual: 1, falhou: 0 });
  assert.ok(!pedidos.includes(S('d')), 'produto oculto não gasta espaço');
  const caminho = (id) => app.db.raw.prepare('SELECT file_path FROM product_images WHERE product_id = ?').get(id).file_path;
  assert.equal(caminho(pub1), `/uploads/biblioteca/${S('a')}-hd.webp`);
  assert.equal(caminho(pub2), `/uploads/biblioteca/${S('b')}-hd.webp`);
  assert.equal(caminho(pub3), `/uploads/biblioteca/${S('c')}.webp`, 'já estava boa');
  // não tenta de novo
  pedidos.length = 0;
  assert.deepEqual(await melhorarFotosPublicadas(app.db, app.deps.storage, images, { limite: 10, fetchFn }), { ok: 0, igual: 0, falhou: 0 });
  assert.equal(pedidos.length, 0);
  // publicou o oculto: entra na próxima rodada
  app.db.raw.exec(`UPDATE products SET active = 1 WHERE id = ${oculto}`);
  assert.deepEqual(await melhorarFotosPublicadas(app.db, app.deps.storage, images, { limite: 10, fetchFn }), { ok: 1, igual: 0, falhou: 0 });
  // sem Cloudflare Images, original grande fica para depois (falhou → tenta amanhã)
  const outro = await app.insertProduct({ slug: 'sem-images', active: 1 });
  app.db.raw.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (?, ?, 0, 1, 1)').run(outro, `/uploads/biblioteca/${S('e')}.webp`);
  app.db.raw.prepare("INSERT INTO uploads (key, content_type, size, etag, chunks) VALUES (?, 'image/webp', 100, 'x', 1)").run(`biblioteca/${S('e')}.webp`);
  await ferramentas.gravarOrigens(app.db, [{ sha: S('e'), url: `https://s3.amazonaws.com/tiny-anexos-us/${S('e')}` }]);
  originais[S('e')] = await img('png', 2000, 2000);
  assert.deepEqual(await melhorarFotosPublicadas(app.db, app.deps.storage, null, { limite: 10, fetchFn }), { ok: 0, igual: 0, falhou: 1 });
});
