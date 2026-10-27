import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { LOGIN_LIMITS } from '../src/auth.js';

test('login, sessão por cookie seguro e logout', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  assert.equal((await app.call('/api/admin/products')).status, 401);
  assert.equal((await app.call('/admin/produtos')).status, 302);

  const res = await app.login();
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^en_admin_sessao=[0-9a-f]{64}; HttpOnly; Path=\/; SameSite=Lax; Max-Age=\d+; Secure$/);
  assert.equal((await app.call('/api/admin/products')).status, 200);
  assert.equal((await app.call('/admin/produtos')).status, 200);
  assert.equal((await app.call('/admin/estoque')).status, 200);

  assert.equal((await app.call('/api/admin/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await app.call('/api/admin/me')).status, 401);
});

test('senha errada e bloqueio após tentativas seguidas', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  const tentar = (password, ip) => app.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password }, ip });
  for (let i = 0; i < LOGIN_LIMITS.perUser; i++) assert.equal((await tentar('errada')).status, 401);
  const bloqueado = await tentar('senha-forte-1');
  assert.equal(bloqueado.status, 429, 'a senha certa também é recusada durante o bloqueio');
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);
  // Depois que o bloqueio vence, a senha certa volta a funcionar e zera o contador.
  await app.db.prepare("UPDATE login_attempts SET locked_until = datetime('now', '-1 minute')").run();
  assert.equal((await tentar('senha-forte-1')).status, 200);
  const row = await app.db.prepare("SELECT * FROM login_attempts WHERE key = 'user:admin'").first();
  assert.equal(row, null);
});

test('senha temporária: só deixa trocar a senha; troca derruba outras sessões', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser({ mustChange: 1, password: 'TempSenha23' });
  await app.login('admin', 'TempSenha23');
  assert.equal((await app.call('/admin/produtos')).status, 302);
  assert.equal((await app.call('/api/admin/products')).status, 403);
  assert.equal((await app.call('/api/admin/change-password', { method: 'POST', body: { newPassword: 'curta' } })).status, 400);
  assert.equal((await app.call('/api/admin/change-password', { method: 'POST', body: { newPassword: 'TempSenha23' } })).status, 400);
  // outra sessão aberta (ex.: outro aparelho)
  await app.db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 1, datetime('now', '+1 day'))").bind('a'.repeat(64)).run();
  assert.equal((await app.call('/api/admin/change-password', { method: 'POST', body: { newPassword: 'NovaSenhaBoa1' } })).status, 200);
  assert.equal((await app.call('/api/admin/products')).status, 200);
  const { c } = await app.db.prepare('SELECT COUNT(*) AS c FROM sessions').first();
  assert.equal(c, 1, 'a outra sessão foi encerrada e a atual continua');
  // agora exige a senha atual
  assert.equal((await app.call('/api/admin/change-password', { method: 'POST', body: { currentPassword: 'errada', newPassword: 'OutraSenha99' } })).status, 401);
});

test('vendedora não acessa estoque, cadastro, OliSek nem backup', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const id = await app.insertProduct({ slug: 'p', stock: 3 });
  await app.login('ana');
  assert.equal((await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: '99.90' } })).status, 200);
  assert.equal((await app.call(`/api/admin/products/${id}/featured`, { method: 'PUT', body: { featured: true } })).status, 200);
  for (const [path, method, body] of [
    [`/api/admin/products/${id}/stock/movements`, 'POST', { kind: 'entrada', quantity: 1 }],
    [`/api/admin/products/${id}/active`, 'PUT', { active: false }],
    [`/api/admin/products/${id}`, 'PUT', { name: 'x' }],
    ['/api/admin/products', 'POST', { name: 'Novo' }],
    ['/api/admin/backup', 'GET'],
  ]) {
    assert.equal((await app.call(path, { method, body })).status, 403, `${method} ${path}`);
  }
  assert.equal((await app.call('/admin/estoque')).status, 302);
  const produto = (await (await app.call(`/api/admin/products/${id}`)).json()).product;
  assert.equal(produto.priceHistory, undefined, 'histórico de preço é só do admin');
});
