// Painel da loja (/admin/loja): a tela simples das vendedoras.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

test('painel da loja: vendedora procura, cadastra, põe foto e publica', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana Souza' });
  const marca = (await app.db.prepare("INSERT INTO brands (name, slug) VALUES ('Lattafa', 'lattafa')").run()).meta.last_row_id;
  await app.insertProduct({ slug: 'khamrah', name: 'Khamrah', brandId: marca, active: 1 });
  await app.insertProduct({ slug: 'yara', name: 'Yara', brandId: marca, active: 0 });

  assert.equal((await app.call('/api/admin/loja/produtos')).status, 401, 'precisa entrar');
  await app.login('ana');
  assert.equal((await app.call('/admin')).headers.get('location'), '/admin/loja', 'vendedora começa na tela simples');
  const pagina = await (await app.call('/admin/loja')).text();
  assert.match(pagina, /Olá, Ana</);
  assert.match(pagina, /IS_ADMIN = false/, 'sem o atalho "Cadastro completo"');
  assert.ok(!/href="\/admin\/produtos"/.test(pagina), 'menu da vendedora sem a lista completa');

  let d = await (await app.call('/api/admin/loja/produtos?q=lattafa')).json();
  assert.deepEqual(d.itens.map((p) => [p.name, p.brand, p.active]), [['Khamrah', 'Lattafa', true], ['Yara', 'Lattafa', false]]);
  d = await (await app.call('/api/admin/loja/produtos?filtro=fora')).json();
  assert.deepEqual(d.itens.map((p) => p.name), ['Yara']);

  const op = await (await app.call('/api/admin/loja/opcoes')).json();
  assert.deepEqual(op.marcas.map((m) => m.name), ['Lattafa']);

  assert.equal((await app.call('/api/admin/loja/produtos', { method: 'POST', body: { name: '  ' } })).status, 400);
  assert.equal((await app.call('/api/admin/loja/produtos', { method: 'POST', body: { name: 'X', brandId: 999 } })).status, 400);
  const r = await app.call('/api/admin/loja/produtos', { method: 'POST', body: { name: 'Asad', brandId: marca, volume: '100 ml' } });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const novo = app.db.raw.prepare('SELECT active, category, volume FROM products WHERE id = ?').get(id);
  assert.deepEqual({ ...novo }, { active: 0, category: 'Perfume', volume: '100 ml' }, 'entra fora do site');

  // sem foto não vai para o site
  let s = await app.call(`/api/admin/loja/produtos/${id}/site`, { method: 'PUT', body: { ativo: true } });
  assert.equal(s.status, 400);
  assert.equal((await s.json()).error, 'sem_foto');
  assert.equal((await app.call(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: PNG_1PX, isMain: true } })).status, 201);
  s = await app.call(`/api/admin/loja/produtos/${id}/site`, { method: 'PUT', body: { ativo: true } });
  assert.deepEqual(await s.json(), { ok: true, active: true });
  assert.ok((await (await app.call('/api/products')).json()).products.some((p) => p.name === 'Asad'), 'já aparece no site');
  s = await app.call(`/api/admin/loja/produtos/${id}/site`, { method: 'PUT', body: { ativo: false } });
  assert.equal((await s.json()).active, false);
  assert.equal((await app.call('/api/admin/loja/produtos/99999/site', { method: 'PUT', body: { ativo: false } })).status, 404);

  // destaque e preço continuam pelas rotas de sempre
  assert.equal((await app.call(`/api/admin/products/${id}/featured`, { method: 'PUT', body: { featured: true } })).status, 200);
  assert.equal((await app.call(`/api/admin/products/${id}/price`, { method: 'PUT', body: { price: 189.9 } })).status, 200);
  d = await (await app.call('/api/admin/loja/produtos?filtro=destaques')).json();
  assert.deepEqual(d.itens.map((p) => [p.name, p.price]), [['Asad', 189.9]]);

  // o resto continua só da administração
  assert.equal((await app.call('/api/admin/products', { method: 'POST', body: { name: 'Y' } })).status, 403);
  assert.equal((await app.call(`/api/admin/products/${id}/active`, { method: 'PUT', body: { active: true } })).status, 403);
  app.logout();
  await app.login();
  assert.equal((await app.call('/admin')).headers.get('location'), '/admin/produtos', 'administração começa na lista completa');
  assert.match(await (await app.call('/admin/loja')).text(), /IS_ADMIN = true/);
});
