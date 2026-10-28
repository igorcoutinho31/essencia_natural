// Equipe cuidada pelo painel: /api/team (público) e /admin/equipe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, PNG_DATA_URL } from './helpers.js';
import { d1Storage } from '../src/storage.js';

test('equipe: lista pública vem do banco, com a formação confirmada', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const r = await app.call('/api/team');
  assert.equal(r.status, 200);
  const { team } = await r.json();
  assert.deepEqual(team.map((p) => p.name), ['Bassam', 'Nicolly', 'Larissa', 'Livia']);
  assert.equal(team[0].photo, '/assets/team/bassam-v2.webp');
  assert.deepEqual(Object.keys(team[0]).sort(), ['id', 'name', 'photo'], 'só nome e foto saem para o público');
});

test('equipe: administração cadastra, renomeia, troca foto, esconde, reordena e remove', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  app.deps.storage = d1Storage(app.db);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const nomes = async () => (await (await app.call('/api/team')).json()).team.map((p) => p.name);

  await app.login('ana');
  assert.equal((await app.call('/api/admin/team', { method: 'POST', body: { name: 'Maria' } })).status, 403, 'vendedora não mexe na equipe');
  assert.equal((await app.call('/admin/equipe')).status, 302);
  app.logout();

  await app.login();
  assert.equal((await app.call('/api/admin/team', { method: 'POST', body: { name: '  ' } })).status, 400);
  const { id } = await (await app.call('/api/admin/team', { method: 'POST', body: { name: 'Maria' } })).json();
  assert.deepEqual(await nomes(), ['Bassam', 'Nicolly', 'Larissa', 'Livia', 'Maria']);

  assert.equal((await app.call(`/api/admin/team/${id}`, { method: 'PUT', body: { name: 'Mariana' } })).status, 200);
  const foto = await (await app.call(`/api/admin/team/${id}/photo`, { method: 'POST', body: { dataUrl: PNG_DATA_URL } })).json();
  assert.match(foto.photo, /^\/uploads\/equipe\//);
  app.logout();
  assert.equal((await app.call(foto.photo)).status, 200, 'foto da equipe é pública');
  await app.login();

  const ids = (await (await app.call('/api/team')).json()).team.map((p) => p.id);
  await app.call('/api/admin/team/order', { method: 'PUT', body: { ids: [id, ...ids.filter((x) => x !== id)] } });
  assert.deepEqual(await nomes(), ['Mariana', 'Bassam', 'Nicolly', 'Larissa', 'Livia']);

  await app.call(`/api/admin/team/${ids[0]}`, { method: 'PUT', body: { active: false } });
  assert.deepEqual(await nomes(), ['Mariana', 'Nicolly', 'Larissa', 'Livia'], 'escondida não aparece no site');
  const pagina = await (await app.call('/admin/equipe')).text();
  assert.match(pagina, /Bassam/, 'mas continua no painel');

  assert.equal((await app.call(`/api/admin/team/${id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual(await nomes(), ['Nicolly', 'Larissa', 'Livia']);
  const lixeira = await app.db.prepare("SELECT COUNT(*) AS n FROM upload_trash WHERE key LIKE 'equipe/%'").first();
  assert.equal(lixeira.n, 1, 'a foto removida vai para a lixeira de 90 dias');
});
