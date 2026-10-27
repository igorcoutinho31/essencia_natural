import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestApp } from './helpers.js';
import { SECURITY_HEADERS } from '../src/http.js';
import { PUBLIC_DIR } from '../server/paths.js';

test('cabeçalhos de segurança em páginas, API e arquivos estáticos', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  for (const p of ['/', '/api/products', '/admin/login', '/sitemap.xml', '/nao-existe']) {
    const res = await app.call(p);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v, `${k} em ${p}`);
  }
  const admin = await app.call('/admin/login');
  assert.equal(admin.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(admin.headers.get('cache-control'), 'no-store');
  // Em http (desenvolvimento local) não manda HSTS.
  const local = await app.call('/', { url: 'http://localhost:3000' });
  assert.equal(local.headers.get('strict-transport-security'), null);
});

test('public/_headers tem os mesmos cabeçalhos do Worker', () => {
  const texto = fs.readFileSync(path.join(PUBLIC_DIR, '_headers'), 'utf8');
  const bloco = texto.split(/\n(?=\/)/).find((b) => b.startsWith('/*'));
  const lidos = Object.fromEntries(bloco.split('\n').slice(1).filter((l) => /^\s+\S/.test(l))
    .map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  assert.deepEqual(lidos, SECURITY_HEADERS);
});

test('pedidos de outra origem não mudam nada no admin (CSRF)', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  const id = await app.insertProduct({ slug: 'p' });
  const r = await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: 1 }, headers: { origin: 'https://golpe.example' } });
  assert.equal(r.status, 403);
  const semOrigin = await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: 1 }, headers: { origin: undefined, 'sec-fetch-site': 'cross-site' } });
  assert.equal(semOrigin.status, 403);
  assert.equal((await app.db.prepare('SELECT price FROM products WHERE id = ?').bind(id).first()).price, null);
  // Login também é protegido (evita "login CSRF").
  assert.equal((await app.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'x' }, headers: { origin: 'https://golpe.example' } })).status, 403);
});

test('domínio sem www redireciona para o oficial', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const r = await app.call('/produto/x?y=1', { url: 'https://lojaessencianatural.com.br' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://www.lojaessencianatural.com.br/produto/x?y=1');
  assert.equal((await app.call('/', { url: 'https://essencia-natural.conta.workers.dev' })).status, 200);
});

test('erros internos não vazam detalhes', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.login();
  app.db.close(); // força um erro de banco
  const r = await app.call('/api/admin/products');
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'server_error', message: 'Erro interno. Tente novamente em instantes.' });
});

test('JSON inválido e corpo grande demais', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  assert.equal((await app.call('/api/admin/login', { method: 'POST', body: '{nao-e-json' })).status, 400);
  assert.equal((await app.call('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'a'.repeat(70000) }) })).status, 413);
});
