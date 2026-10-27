// Teste de fumaça contra um site no ar (wrangler dev, workers.dev ou o
// domínio final). Só leitura por padrão — seguro em produção:
//
//   npm run cf:smoke -- https://essencia-natural.<conta>.workers.dev
//
// Com --escrita (SÓ em ambiente de teste, ex. http://127.0.0.1:8787):
// entra no admin, troca a senha temporária, registra entrada/saída de
// estoque, envia e apaga uma foto e baixa o backup. Precisa de
//   SMOKE_USER, SMOKE_PASS (senha temporária) e SMOKE_NOVA_SENHA.
import assert from 'node:assert/strict';

const base = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const escrita = process.argv.includes('--escrita');
let cookie = '';

async function req(path, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
  const res = await fetch(base + path, {
    method, redirect,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json', origin: base } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return res;
}

async function check(nome, fn) {
  try { await fn(); console.log('  ok  ', nome); } catch (e) { console.log('  FALHOU', nome, '-', e.message); process.exitCode = 1; }
}

console.log(`Site: ${base}${escrita ? ' (com escrita)' : ''}\n`);

await check('home e cabeçalhos de segurança', async () => {
  const r = await req('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
let produtos;
await check('catálogo público', async () => {
  const r = await req('/api/products');
  assert.equal(r.status, 200);
  produtos = (await r.json()).products;
  assert.ok(produtos.length > 0, 'nenhum produto público');
  assert.ok(!('stock' in produtos[0]), 'estoque numérico exposto');
});
await check('página de produto com canonical', async () => {
  const r = await req('/produto/' + encodeURIComponent(produtos[0].slug));
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<link rel="canonical" href="https:\/\//);
});
await check('foto do produto', async () => {
  const p = produtos.find((x) => x.hasImage);
  assert.ok(p, 'nenhum produto com foto');
  const r = await req(p.image);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /^image\//);
});
await check('marcas, sitemap, robots, links', async () => {
  for (const p of ['/api/brands', '/sitemap.xml', '/robots.txt', '/links']) assert.equal((await req(p)).status, 200, p);
});
await check('arquivos internos não são públicos', async () => {
  for (const p of ['/_headers', '/package.json', '/wrangler.toml', '/src/app.js', '/seed/catalog.json', '/migrations/0001_init.sql']) {
    assert.equal((await req(p)).status, 404, p);
  }
});
await check('admin exige login', async () => {
  assert.equal((await req('/api/admin/products')).status, 401);
  assert.equal((await req('/admin/produtos')).status, 302);
});

if (escrita) {
  const { SMOKE_USER: user, SMOKE_PASS: pass, SMOKE_NOVA_SENHA: nova } = process.env;
  assert.ok(user && pass && nova, 'defina SMOKE_USER, SMOKE_PASS e SMOKE_NOVA_SENHA');
  await check('pedido de outra origem é recusado', async () => {
    const r = await req('/api/admin/login', { method: 'POST', body: { username: user, password: pass }, headers: { origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
  });
  await check('login + troca obrigatória da senha', async () => {
    let r = await req('/api/admin/login', { method: 'POST', body: { username: user, password: pass } });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await req('/api/admin/products')).status, 403); // senha temporária: só pode trocar
    r = await req('/api/admin/change-password', { method: 'POST', body: { newPassword: nova } });
    assert.equal(r.status, 200, await r.clone().text());
  });
  let id;
  await check('entrada e saída de estoque (sem ficar negativo)', async () => {
    id = (await (await req('/api/admin/products')).json()).products[0].id;
    let r = await req(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body: { kind: 'entrada', quantity: 5, reason: 'smoke' } });
    assert.equal(r.status, 201, await r.clone().text());
    const saldo = (await r.json()).movement.stockAfter;
    r = await req(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body: { kind: 'saida', quantity: saldo + 1, reason: 'smoke' } });
    assert.equal(r.status, 409);
    r = await req(`/api/admin/products/${id}/stock/movements`, { method: 'POST', body: { kind: 'saida', quantity: 5, reason: 'smoke' } });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).movement.stockAfter, saldo - 5);
  });
  await check('upload e exclusão de foto', async () => {
    // PNG 1x1 válido
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    let r = await req(`/api/admin/products/${id}/images`, { method: 'POST', body: { dataUrl: png } });
    assert.equal(r.status, 201, await r.clone().text());
    const img = (await r.json()).image;
    assert.equal((await req(img.path)).status, 200);
    r = await req(`/api/admin/products/${id}/images/${img.id}`, { method: 'DELETE', headers: { origin: base } });
    assert.equal(r.status, 200);
    assert.equal((await req(img.path)).status, 404);
  });
  await check('backup completo', async () => {
    const r = await req('/api/admin/backup');
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.format, 'essencia-natural-backup');
    assert.ok(b.tables.products.length > 0);
  });
  await check('logout', async () => {
    assert.equal((await req('/api/admin/logout', { method: 'POST', body: {} })).status, 200);
    assert.equal((await req('/api/admin/me')).status, 401);
  });
}

console.log(process.exitCode ? '\nHouve falhas.' : '\nTudo certo.');
