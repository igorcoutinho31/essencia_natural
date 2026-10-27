import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { movementStatement } from '../src/services/inventory.js';
import * as catalog from '../src/services/catalog.js';
import { _resetTokenCache } from '../src/services/olisek.js';

async function setup(t) {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: 'p', stock: 0 });
  const mover = (body) => app.call(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body });
  const saldo = async () => (await app.db.prepare('SELECT stock, stock_source FROM products WHERE id = ?').bind(id).first());
  return { app, id, mover, saldo };
}

test('entrada, saída e ajuste ficam no histórico e o saldo bate', async (t) => {
  const { app, id, mover, saldo } = await setup(t);
  let r = await mover({ kind: 'entrada', quantity: 10 });
  assert.equal(r.status, 201);
  assert.deepEqual((await r.json()).movement, { id: 1, quantity: 10, stockBefore: 0, stockAfter: 10 });
  assert.equal((await mover({ kind: 'saida', quantity: 3 })).status, 400, 'saída exige motivo');
  assert.equal((await mover({ kind: 'saida', quantity: 3, reason: 'Venda na loja' })).status, 201);
  assert.equal((await mover({ kind: 'ajuste', quantity: 5, reason: 'Contagem física' })).status, 201);
  const ajusteIgual = await mover({ kind: 'ajuste', quantity: 5, reason: 'Conferido' });
  assert.equal(ajusteIgual.status, 200);
  assert.equal((await ajusteIgual.json()).movement, null);
  assert.deepEqual(await saldo(), { stock: 5, stock_source: 'manual' });

  const hist = (await (await app.call(`/api/admin/products/${id}/stock/movements`)).json()).movements;
  assert.deepEqual(hist.map((m) => [m.kind, m.quantity, m.stockBefore, m.stockAfter, m.userName]), [
    ['ajuste', -2, 7, 5, 'Administração'],
    ['saida', -3, 10, 7, 'Administração'],
    ['entrada', 10, 0, 10, 'Administração'],
  ]);
  // A soma das movimentações é sempre o saldo atual.
  assert.equal(hist.reduce((s, m) => s + m.quantity, 0), (await saldo()).stock);
});

test('estoque nunca fica negativo, nem com baixas simultâneas', async (t) => {
  const { app, id, mover, saldo } = await setup(t);
  await mover({ kind: 'entrada', quantity: 3 });
  const r = await mover({ kind: 'saida', quantity: 4, reason: 'Venda' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).message, /há 3 unidade/);
  const respostas = await Promise.all(Array.from({ length: 6 }, () => mover({ kind: 'saida', quantity: 1, reason: 'Venda' })));
  assert.equal(respostas.filter((x) => x.status === 201).length, 3);
  assert.equal(respostas.filter((x) => x.status === 409).length, 3);
  assert.equal((await saldo()).stock, 0);
  for (const body of [{ kind: 'entrada', quantity: -1 }, { kind: 'entrada', quantity: 1.5 }, { kind: 'entrada', quantity: 0 }, { kind: 'roubo', quantity: 1 }]) {
    assert.equal((await mover(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await app.call('/api/admin/products/999/stock/movements', { method: 'POST', body: { kind: 'entrada', quantity: 1 } })).status, 404);
  // O próprio banco recusa saldo negativo, mesmo sem passar pela API.
  await assert.rejects(app.db.prepare(
    "INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source) VALUES (?, 'saida', -1, 0, -1, 'manual')"
  ).bind(id).run());
});

test('rota antiga PUT /stock vira ajuste registrado', async (t) => {
  const { app, id, saldo } = await setup(t);
  const r = await app.call(`/api/admin/products/${id}/stock`, { method: 'PUT', body: { stock: 8 } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).product.stock, 8);
  const m = await app.db.prepare('SELECT kind, reason FROM stock_movements').first();
  assert.deepEqual(m, { kind: 'ajuste', reason: 'Ajuste manual na tela do produto' });
  assert.equal((await saldo()).stock, 8);
});

test('produto novo com estoque inicial e vínculo OliSek vindo de relatório', async (t) => {
  const { app } = await setup(t);
  let r = await app.call('/api/admin/products', { method: 'POST', body: { name: 'Novo Perfume', stock: 4, category: 'perfumes' } });
  assert.equal(r.status, 201);
  const novo = (await r.json()).product;
  assert.equal(novo.stock, 4);
  assert.equal(novo.active, false, 'produto novo nasce despublicado (como antes)');
  r = await app.call('/api/admin/olisek/link', { method: 'POST', body: { productId: novo.id, olisekId: 123, olisekName: 'NOVO', stock: 9 } });
  assert.equal(r.status, 200);
  const p = (await r.json()).product;
  assert.deepEqual([p.stock, p.stockSource, p.olisekLinkStatus], [9, 'olisek_import', 'confirmed']);
  const kinds = (await app.db.prepare('SELECT kind FROM stock_movements WHERE product_id = ? ORDER BY id').bind(novo.id).all()).results.map((x) => x.kind);
  assert.deepEqual(kinds, ['inicial', 'olisek_import']);
  // O mesmo ID OliSek não pode ir para dois produtos.
  const outro = await app.insertProduct({ slug: 'outro' });
  r = await app.call(`/api/admin/products/${outro}/olisek`, { method: 'PUT', body: { olisekId: 123, linkStatus: 'confirmed' } });
  assert.equal(r.status, 409);
});

test('sincronização com a OliSek: só vínculos confirmados, erro isolado por produto', async (t) => {
  const { app } = await setup(t);
  _resetTokenCache();
  const config = { olisekLogin: 'loja', olisekPassword: 'segredo', olisekApiUrl: 'https://olisek.test/v1' };
  const estoques = { 1: 7, 2: 50 };
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    if (url.endsWith('/auth')) return Response.json({ success: true, data: { token: 't', expires_in: 3600 } });
    const id = new URL(url).searchParams.get('id');
    if (id === '3') return Response.json({ success: false, error: { message: 'não achei' } }, { status: 404 });
    return Response.json({ success: true, data: { stock: estoques[id] } });
  };
  const ins = (slug, olisekId, status) => app.db.prepare("INSERT INTO products (slug, name, olisek_id, olisek_link_status) VALUES (?, 'x', ?, ?)").bind(slug, olisekId, status).run();
  await ins('c1', 1, 'confirmed');
  await ins('c2', 2, 'confirmed');
  await ins('c3', 3, 'confirmed');
  await ins('prov', 4, 'probable');
  const report = await catalog.syncAllFromOlisek(app.db, config, { fetchImpl, user: { id: null, name: 'Cron' } });
  assert.deepEqual({ ...report, erros: report.erros.length }, { total: 3, atualizados: 2, semMudanca: 0, erros: 1 });
  assert.equal(chamadas.filter((u) => u.endsWith('/auth')).length, 1, 'token reaproveitado');
  const rows = (await app.db.prepare("SELECT slug, stock, stock_source, olisek_synced_at IS NOT NULL AS sinc FROM products WHERE olisek_id IS NOT NULL ORDER BY olisek_id").all()).results;
  assert.deepEqual(rows.map((r) => [r.slug, r.stock, r.stock_source, r.sinc]), [
    ['c1', 7, 'olisek_api', 1], ['c2', 50, 'olisek_api', 1], ['c3', 0, 'none', 0], ['prov', 0, 'none', 0],
  ]);
  // Rodar de novo sem mudança na OliSek não cria movimentação nova.
  const antes = (await app.db.prepare('SELECT COUNT(*) AS c FROM stock_movements').first()).c;
  await catalog.syncAllFromOlisek(app.db, config, { fetchImpl });
  assert.equal((await app.db.prepare('SELECT COUNT(*) AS c FROM stock_movements').first()).c, antes);
  // Sem credenciais, a API não é chamada.
  const sem = await app.call('/api/admin/stock/olisek-sync', { method: 'POST', body: {} });
  assert.equal(sem.status, 501);
});

test('movementStatement recusa tipo inválido', () => {
  assert.throws(() => movementStatement({ prepare() {} }, 1, { kind: 'x', delta: 1, stockSource: 'manual' }), /invalid_kind/);
});

test('visão geral e CSV do estoque', async (t) => {
  const { app, mover } = await setup(t);
  await mover({ kind: 'entrada', quantity: 2 });
  await app.insertProduct({ slug: 'z', name: '=HYPERLINK("http://x")', stock: 0 });
  const ov = await (await app.call('/api/admin/stock')).json();
  assert.deepEqual(ov.totals, { produtos: 2, unidades: 2, zerados: 1, baixos: 1 });
  const res = await app.call('/admin/estoque.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="estoque-\d{4}-\d{2}-\d{2}\.csv"/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 para o Excel abrir os acentos certo');
  const csv = new TextDecoder().decode(bytes);
  assert.ok(csv.startsWith('id;produto;'));
  assert.ok(csv.includes(`'=HYPERLINK`), 'fórmula neutralizada (CSV injection)');
  const movs = await (await app.call('/admin/estoque/movimentacoes.csv')).text();
  assert.match(movs, /;Entrada;2;0;2;/);
});
