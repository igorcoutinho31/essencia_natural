// Fotos em alta automáticas (cron): sem painel, as fotos dos produtos
// publicados viram a melhor versão do original do fornecedor.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createTestApp } from './helpers.js';
import { dimensoes, melhorarFotosPublicadas } from '../src/services/fotosAuto.js';
import * as fotosAuto from '../src/services/fotosAuto.js';

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
    await fotosAuto.gravarOrigens(app.db, [{ sha, url: `https://s3.amazonaws.com/tiny-anexos-us/${sha}` }]);
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
  await fotosAuto.gravarOrigens(app.db, [{ sha: S('e'), url: `https://s3.amazonaws.com/tiny-anexos-us/${S('e')}` }]);
  originais[S('e')] = await img('png', 2000, 2000);
  assert.deepEqual(await melhorarFotosPublicadas(app.db, app.deps.storage, null, { limite: 10, fetchFn }), { ok: 0, igual: 0, falhou: 1 });
});

const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const webp = (n = 40) => { const b = new Uint8Array(n); b.set([...Buffer.from('RIFF')], 0); b.set([...Buffer.from('WEBP')], 8); return b; };

test('fotos em alta: só endereços dos fornecedores conhecidos', () => {
  const ok = ['https://media-n.atlanticostor.com.br/atlantico/integrations/x/y.webp', 'https://s3.amazonaws.com/tiny-anexos-us/erp/a/b.jpg'];
  const nao = ['http://media-n.atlanticostor.com.br/a.webp', 'https://s3.amazonaws.com/outro-bucket/a.jpg', 'https://evil.com/a.webp',
    'https://user:x@media-n.atlanticostor.com.br/a.webp', 'https://media-n.atlanticostor.com.br:8443/a.webp', 'https://169.254.169.254/latest', 'nada'];
  ok.forEach((u) => assert.equal(fotosAuto.urlOrigemValida(u), true, u));
  nao.forEach((u) => assert.equal(fotosAuto.urlOrigemValida(u), false, u));
});

test('fotos em alta: busca do original só por sha guardado', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await fotosAuto.gravarOrigens(app.db, [{ sha: SHA_A, url: 'https://s3.amazonaws.com/tiny-anexos-us/erp/a.jpg' }]);
  const pedidos = [];
  const falso = async (url, init) => { pedidos.push([url, init.redirect]); return new Response(webp(), { status: 200 }); };
  assert.deepEqual(await fotosAuto.baixarOriginal(app.db, SHA_B, falso), { erro: 'sem_origem' });
  assert.deepEqual(await fotosAuto.baixarOriginal(app.db, '../x', falso), { erro: 'sha_invalido' });
  const r = await fotosAuto.baixarOriginal(app.db, SHA_A, falso);
  assert.equal(r.contentType, 'image/webp');
  assert.deepEqual(pedidos, [['https://s3.amazonaws.com/tiny-anexos-us/erp/a.jpg', 'manual']]);
  const html = async () => new Response('<html>', { status: 200 });
  assert.deepEqual(await fotosAuto.baixarOriginal(app.db, SHA_A, html), { erro: 'nao_e_imagem' });
  const redir = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
  assert.deepEqual(await fotosAuto.baixarOriginal(app.db, SHA_A, redir), { erro: 'fornecedor_302' });
});

test('fotos em alta: gravar troca a foto em todos os produtos e guarda a antiga', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const a = await app.insertProduct({ slug: 'a', active: 1 });
  const b = await app.insertProduct({ slug: 'b', active: 0 });
  for (const id of [a, b]) app.db.raw.prepare('INSERT INTO product_images (product_id, file_path, sort_order, is_main, licensed) VALUES (?, ?, 0, 1, 1)').run(id, `/uploads/biblioteca/${SHA_A}.webp`);
  assert.deepEqual(await fotosAuto.gravarHD(app.db, app.deps.storage, SHA_A, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), { erro: 'formato' });
  assert.deepEqual(await fotosAuto.gravarHD(app.db, app.deps.storage, 'c'.repeat(64), webp()), { erro: 'nao_encontrada' });
  assert.deepEqual(await fotosAuto.gravarHD(app.db, app.deps.storage, SHA_A, webp()), { image: `/uploads/biblioteca/${SHA_A}-hd.webp`, produtos: 2 });
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM product_images WHERE file_path = ?').get(`/uploads/biblioteca/${SHA_A}-hd.webp`).n, 2);
  assert.ok(app.db.raw.prepare('SELECT 1 FROM upload_trash WHERE key = ?').get(`biblioteca/${SHA_A}.webp`), 'a antiga vai para a lixeira');
});

test('tela de ferramentas removida: endereço antigo leva ao início do painel', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  assert.equal((await app.call('/admin/ferramentas')).headers.get('location'), '/admin');
  assert.equal((await app.call('/api/admin/ferramentas/produtos')).status, 404);
  assert.ok(!/admin\/ferramentas/.test(await (await app.call('/admin/produtos')).text()), 'sem link no menu');
});
