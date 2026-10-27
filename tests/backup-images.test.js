import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, PNG_DATA_URL } from './helpers.js';
import { SqliteD1, applyMigrations } from '../server/sqlite-d1.js';
import { BACKUP_TABLES, backupToSQL } from '../src/services/backup.js';

test('upload de foto: valida o formato real, grava, serve e apaga', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: 'perfume', stock: 1 });
  const fake = 'data:image/png;base64,' + Buffer.from('<?php echo 1; ?>').toString('base64');
  assert.equal((await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: fake } })).status, 400);

  const r = await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: PNG_DATA_URL } });
  assert.equal(r.status, 201);
  const { image } = await r.json();
  assert.match(image.path, /^\/uploads\/products\/perfume\/[0-9a-f]{12}\.png$/);
  const foto = await app.call(image.path);
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get('content-type'), 'image/png');
  const etag = foto.headers.get('etag');
  assert.equal((await app.call(image.path, { headers: { 'if-none-match': etag } })).status, 304);

  const pub = (await (await app.call('/api/products/slug/perfume')).json()).product;
  assert.equal(pub.image, image.path);
  assert.equal((await app.call(`/api/admin/products/${id}/images/${image.id}`, { method: 'DELETE', headers: { origin: 'https://www.lojaessencianatural.com.br' } })).status, 200);
  assert.equal((await app.call(image.path)).status, 404);
});

test('foto passa pelo binding de Images quando existe (e cai no original se falhar)', async (t) => {
  const otimizada = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), 1]);
  const images = {
    input() {
      return { transform() { return this; }, output: async () => ({ response: () => new Response(otimizada) }) };
    },
  };
  const app = createTestApp({ images });
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: 'p' });
  const grande = 'data:image/png;base64,' + Buffer.concat([Buffer.from(PNG_DATA_URL.split(',')[1], 'base64'), Buffer.alloc(100)]).toString('base64');
  const r = await (await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: grande } })).json();
  assert.equal(r.image.optimized, true);
  assert.match(r.image.path, /\.webp$/);

  app.deps.images = { input() { throw new Error('Images indisponível'); } };
  const r2 = await (await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: PNG_DATA_URL } })).json();
  assert.equal(r2.image.optimized, false);
  assert.match(r2.image.path, /\.png$/);
});

test('backup completo → SQL → banco novo fica idêntico', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: "d'água", name: "Perfume d'água", stock: 0, price: 10.5 });
  await app.call(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body: { kind: 'entrada', quantity: 4 } });
  await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: 12 } });
  await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: PNG_DATA_URL } });

  const res = await app.call('/api/admin/backup');
  assert.match(res.headers.get('content-disposition'), /essencia-natural-backup-.*\.json/);
  const backup = await res.json();
  assert.equal(backup.uploads.length, 1);
  assert.equal(backup.tables.sessions, undefined, 'sessões não vão no backup');

  const destino = new SqliteD1(':memory:');
  t.after(() => destino.close());
  applyMigrations(destino);
  await destino.prepare("INSERT INTO products (slug, name) VALUES ('lixo', 'será apagado')").run();
  const cols = Object.fromEntries(BACKUP_TABLES.map((tb) => [tb, destino.raw.prepare(`PRAGMA table_info(${tb})`).all().map((c) => c.name)]));
  destino.raw.exec(backupToSQL(backup, cols));
  for (const tb of BACKUP_TABLES) {
    const a = (await app.db.prepare(`SELECT * FROM ${tb} ORDER BY rowid`).all()).results;
    const b = (await destino.prepare(`SELECT * FROM ${tb} ORDER BY rowid`).all()).results;
    assert.deepEqual(b, a, tb);
  }
  // O trigger de estoque volta a funcionar depois da carga.
  await destino.prepare("INSERT INTO stock_movements (product_id, kind, quantity, stock_before, stock_after, stock_source) VALUES (?, 'entrada', 1, 4, 5, 'manual')").bind(id).run();
  assert.equal((await destino.prepare('SELECT stock FROM products WHERE id = ?').bind(id).first()).stock, 5);
});

test('backup de um banco antigo (sem histórico de estoque) abre o histórico com o saldo', () => {
  const destino = new SqliteD1(':memory:');
  applyMigrations(destino);
  const backup = {
    format: 'essencia-natural-backup',
    tables: {
      products: [{ id: 1, slug: 'a', name: 'A', stock: 7, stock_source: 'olisek_import', olisek_match_confidence: 'confirmado' }],
    },
  };
  const cols = Object.fromEntries(BACKUP_TABLES.map((tb) => [tb, destino.raw.prepare(`PRAGMA table_info(${tb})`).all().map((c) => c.name)]));
  destino.raw.exec(backupToSQL(backup, cols));
  const m = destino.raw.prepare('SELECT kind, stock_before, stock_after FROM stock_movements').all();
  assert.deepEqual(m.map((x) => ({ ...x })), [{ kind: 'inicial', stock_before: 0, stock_after: 7 }]);
  assert.throws(() => backupToSQL({ format: 'outro' }, cols), /não é um backup/);
  destino.close();
});
