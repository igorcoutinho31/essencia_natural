// O servidor Node (usado no desenvolvimento e nos testes) monta
// a base inicial sozinho, abre o histórico de estoque e responde igual ao
// Worker — inclusive Set-Cookie e corpo de POST.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { openDatabase } from '../server/sqlite-d1.js';
import { createNodeDeps, createServer } from '../server/app.js';
import { run as montarBaseInicial } from '../scripts/base-inicial.js';
import { hashPassword } from '../src/auth.js';

test('base inicial + servidor HTTP do Node', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'essencia-node-'));
  const log = console.log;
  console.log = () => {};
  const db = openDatabase(path.join(dir, 'essencia.sqlite'));
  try {
    assert.equal(await montarBaseInicial(db, path.join(dir, 'uploads')), true);
    assert.equal(await montarBaseInicial(db, path.join(dir, 'uploads')), false, 'não roda duas vezes');
  } finally { console.log = log; }

  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM products').first();
  assert.equal(c, 34);
  const semHistorico = await db.prepare(
    'SELECT COUNT(*) AS c FROM products p WHERE stock > 0 AND stock <> (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements m WHERE m.product_id = p.id)'
  ).first();
  assert.equal(semHistorico.c, 0, 'todo saldo tem histórico que soma o mesmo número');

  const { hash, salt } = hashPassword('senha-forte-1');
  await db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE username = 'admin'").bind(hash, salt).run();

  const server = createServer(createNodeDeps({ STORAGE_DIR: dir }, { db }), { trustProxy: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('strict-transport-security'), null, 'http local: sem HSTS');
  const foto = (await (await fetch(base + '/api/products')).json()).products.find((p) => p.hasImage);
  assert.equal((await fetch(base + foto.image)).status, 200, 'fotos copiadas para uploads/');

  const login = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ username: 'admin', password: 'senha-forte-1' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(!/Secure/.test(cookie), 'sem HTTPS, cookie sem Secure');
  const me = await fetch(base + '/api/admin/me', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal((await me.json()).user.username, 'admin');
});
