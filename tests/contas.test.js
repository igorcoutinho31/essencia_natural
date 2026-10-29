// Contas do painel (/admin/contas): só administração cria, renomeia, troca
// o tipo, gera senha nova e desativa — sem terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { nomeBonito } from '../src/services/contas.js';

test('contas: nomes com iniciais maiúsculas', () => {
  assert.equal(nomeBonito('vendedora1'), 'Vendedora 1');
  assert.equal(nomeBonito('  maria   souza '), 'Maria Souza');
  assert.equal(nomeBonito('Bassam'), 'Bassam');
  assert.equal(nomeBonito("ana d'ávila"), "Ana D'Ávila");
});

test('contas: administração cria e cuida das contas pelo painel', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });

  await app.login('ana');
  assert.equal((await app.call('/api/admin/contas')).status, 403, 'vendedora não mexe em contas');
  assert.equal((await app.call('/admin/contas')).headers.get('location'), '/admin/loja');
  app.logout();

  await app.login();
  assert.match(await (await app.call('/admin/contas')).text(), /Nova conta/);
  // senha digitada, sem troca obrigatória; usuário vira minúsculo
  let r = await app.call('/api/admin/contas', { method: 'POST', body: { nome: 'igor', usuario: 'Igor', papel: 'admin', senha: 'SenhaLonga123', trocar: false } });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { ok: true, username: 'igor', name: 'Igor', senhaGerada: null });
  // senha gerada pelo painel
  r = await app.call('/api/admin/contas', { method: 'POST', body: { nome: 'vendedora1', usuario: 'vendedora1', papel: 'vendedora' } });
  const v1 = await r.json();
  assert.equal(v1.name, 'Vendedora 1');
  assert.match(v1.senhaGerada, /^[A-Za-z0-9]{10}$/);
  // erros
  assert.equal((await app.call('/api/admin/contas', { method: 'POST', body: { nome: 'X', usuario: 'igor' } })).status, 400, 'usuário repetido');
  assert.equal((await app.call('/api/admin/contas', { method: 'POST', body: { nome: 'X', usuario: 'com espaço' } })).status, 400);
  assert.equal((await app.call('/api/admin/contas', { method: 'POST', body: { nome: 'X', usuario: 'xx2', senha: 'curta' } })).status, 400);

  const lista = (await (await app.call('/api/admin/contas')).json()).contas;
  const id = (u) => lista.find((c) => c.username === u).id;
  assert.equal(lista.find((c) => c.username === 'vendedora1').trocarSenha, true);
  assert.equal(lista.find((c) => c.username === 'igor').trocarSenha, false);

  // renomear a vendedora
  assert.equal((await app.call(`/api/admin/contas/${id('vendedora1')}`, { method: 'PUT', body: { nome: 'julia' } })).status, 200);
  assert.equal(app.db.raw.prepare('SELECT name FROM users WHERE username = ?').get('vendedora1').name, 'Julia');

  // a própria conta não muda de tipo nem é desativada
  assert.equal((await app.call(`/api/admin/contas/${id('admin')}`, { method: 'PUT', body: { ativo: false } })).status, 400);
  assert.equal((await app.call(`/api/admin/contas/${id('admin')}`, { method: 'PUT', body: { papel: 'vendedora' } })).status, 400);

  // login: senha digitada vale direto, e o usuário não diferencia maiúsculas
  app.logout();
  const login = await app.call('/api/admin/login', { method: 'POST', body: { username: 'Igor', password: 'SenhaLonga123' } });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.mustChangePassword, false);
  // senha gerada: entra, mas precisa trocar
  await app.login('vendedora1', v1.senhaGerada);
  assert.equal((await app.call('/api/admin/loja/produtos')).status, 403, 'com senha temporária, só trocar a senha');
  app.logout();

  // senha nova e desativar (feito pelo igor, que é administração)
  await app.login('igor', 'SenhaLonga123');
  r = await (await app.call(`/api/admin/contas/${id('vendedora1')}/senha`, { method: 'POST' })).json();
  assert.match(r.senhaGerada, /^[A-Za-z0-9]{10}$/);
  assert.equal((await app.call(`/api/admin/contas/${id('vendedora1')}`, { method: 'PUT', body: { ativo: false } })).status, 200);
  app.logout();
  assert.equal((await app.call('/api/admin/login', { method: 'POST', body: { username: 'vendedora1', password: r.senhaGerada } })).status, 401, 'desativada não entra');
});
