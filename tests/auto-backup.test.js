import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { SqliteD1, applyMigrations } from '../server/sqlite-d1.js';
import { BACKUP_TABLES, backupToSQL } from '../src/services/backup.js';
import {
  createSnapshot, readSnapshotJSON, listSnapshots, pruneSnapshots, weeklySnapshotIfDue, KEEP_SNAPSHOTS,
} from '../src/services/autoBackup.js';

const tabelas = async (db) => Object.fromEntries(await Promise.all(BACKUP_TABLES.map(async (t) =>
  [t, (await db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()).results])));

test('cópia automática: guarda os dados, baixa no admin e restaura idêntico', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: "d'água", name: 'Perfume "teste" d\'água', stock: 0, price: 10.5 });
  await app.call(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body: { kind: 'entrada', quantity: 4 } });
  await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: 12 } });

  const snap = await createSnapshot(app.db);
  const [info] = await listSnapshots(app.db);
  assert.equal(info.id, snap);
  assert.equal(info.summary.products, 1);
  assert.equal(info.summary.stock_movements, 1);

  // Mudanças depois da cópia não entram nela.
  await app.db.prepare("UPDATE products SET name = 'mudou'").run();
  const res = await app.call(`/api/admin/backups/${snap}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /backup-automatico-\d+\.json/);
  const backup = await res.json();
  assert.equal(backup.format, 'essencia-natural-backup');
  assert.equal(backup.tables.products[0].name, 'Perfume "teste" d\'água');
  assert.equal((await app.call('/api/admin/backups/9999')).status, 404);

  // Restaurar num banco novo dá exatamente os dados do momento da cópia.
  await app.db.prepare("UPDATE products SET name = 'Perfume \"teste\" d''água'").run();
  const destino = new SqliteD1(':memory:');
  t.after(() => destino.close());
  applyMigrations(destino);
  const cols = Object.fromEntries(BACKUP_TABLES.map((tb) => [tb, destino.raw.prepare(`PRAGMA table_info(${tb})`).all().map((c) => c.name)]));
  destino.raw.exec(backupToSQL(backup, cols));
  assert.deepEqual(await tabelas(destino), await tabelas(app.db));
});

test('cópia semanal: só uma a cada 7 dias e guarda as 12 mais recentes', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.insertProduct({ slug: 'p', stock: 1 });
  assert.ok(await weeklySnapshotIfDue(app.db), 'primeira cópia');
  assert.equal(await weeklySnapshotIfDue(app.db), null, 'não repete na mesma semana');
  await app.db.prepare("UPDATE auto_backups SET created_at = datetime('now', '-8 days')").run();
  assert.ok(await weeklySnapshotIfDue(app.db), 'uma semana depois, faz outra');

  for (let i = 0; i < KEEP_SNAPSHOTS + 3; i++) await createSnapshot(app.db);
  await pruneSnapshots(app.db);
  const lista = await listSnapshots(app.db);
  assert.equal(lista.length, KEEP_SNAPSHOTS);
  const ids = lista.map((s) => s.id);
  const orfas = await app.db.prepare(`SELECT COUNT(*) AS c FROM auto_backup_rows WHERE backup_id NOT IN (${ids.join(',')})`).first();
  assert.equal(orfas.c, 0, 'linhas das cópias apagadas também saem');
});

test('vendedora não baixa cópias e o painel mostra os backups', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const snap = await createSnapshot(app.db);
  await app.login();
  const html = await (await app.call('/admin/estoque')).text();
  assert.match(html, /Backups automáticos/);
  assert.match(html, new RegExp(`/api/admin/backups/${snap}`));
  app.logout();
  await app.login('ana');
  assert.equal((await app.call(`/api/admin/backups/${snap}`)).status, 403);
  assert.equal((await app.call('/api/admin/backup')).status, 403);
});
