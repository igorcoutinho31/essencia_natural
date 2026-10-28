import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, PNG_DATA_URL } from './helpers.js';
import * as R from '../tools/biblioteca-regras.js';
import { planejar, sqlCadastros, sqlLigarFotos } from '../tools/biblioteca-plano.js';
import { d1Storage } from '../src/storage.js';

const item = (over = {}) => ({
  source: 'onuh', sourceId: 'onuh:x', sourceUrl: 'https://exemplo/x', name: 'Afnan 9 Am Dive EDP 100 ml', brand: 'Afnan',
  category: 'Perfumaria > Perfumes Arabes', volume: '100 ml', concentration: 'EDP',
  description: 'Texto de venda do fornecedor. Família Olfativa: Cítrico Notas de Topo: Limão, Menta Notas de Coração: Maçã Notas de Fundo: Sândalo',
  images: [{ localPath: 'images/aaa.jpg', sha256: 'aaa' }], ...over,
});
const vazio = { slugs: [], sourceIds: [], marcas: [], produtosLoja: [], fotosExistentes: [] };

test('regras: nome, categoria, notas e marca', () => {
  assert.equal(R.limparNome('.. BODY SPLASH AFEER DELILAH 200ML'), 'Body Splash Afeer Delilah 200ml');
  assert.equal(R.limparNome('AL WATANIAH EQAAB EDP H 100ML'), 'Al Wataniah Eqaab EDP H 100ml');
  assert.equal(R.limparNome('Afnan 9 Am Dive EDP 100 ml'), 'Afnan 9 Am Dive EDP 100 ml', 'nome normal não muda');
  assert.equal(R.categoria({ category: 'body splash', name: 'X' }), 'Body Splash');
  assert.equal(R.categoria({ category: 'pasta', name: 'Pasta Afeer' }), 'Cuidados corporais');
  assert.equal(R.categoria({ category: 'Perfumaria > Skincare', name: 'Serum' }), 'Skincare');
  assert.equal(R.categoria({ category: 'Perfumaria > Perfumes Arabes', name: 'Khamrah' }), 'Perfume');
  assert.deepEqual(R.extrairNotas(item().description), { topo: 'Limão, Menta', coracao: 'Maçã', fundo: 'Sândalo', familia: 'Cítrico' });
  assert.deepEqual(R.extrairNotas('Notas de Topo: Pera Notas de Fundo…'), { topo: 'Pera', coracao: null, fundo: null, familia: null });
  assert.equal(R.chaveMarca('Maison Al Hambra'), R.chaveMarca('Maison Alhambra'));
  assert.equal(R.chaveMarca('Wataniah'), R.chaveMarca('Al Wataniah'));
  assert.equal(R.chaveMarca('OPENBOX'), null);
});

test('regras: cruzamento com o relatório da loja', () => {
  const idx = R.indiceRelatorio([{ nome: 'LATTAFA ATHEERI EDP F 100ML' }, { nome: 'AFNAN 9PM ELIXIR EDP U 100ML' }]);
  assert.equal(R.casarRelatorio(idx, 'Atheeri', 'Lattafa'), 'LATTAFA ATHEERI EDP F 100ML');
  assert.equal(R.casarRelatorio(idx, 'Afnan 9pm Elixir 100ml', 'Afnan'), 'AFNAN 9PM ELIXIR EDP U 100ML');
  assert.equal(R.casarRelatorio(idx, 'Afnan 9pm Rebel', 'Afnan'), null);
  assert.equal(R.casarRelatorio(idx, 'Lattafa', 'Lattafa'), null, 'só a marca não basta');
  assert.deepEqual([...R.tokens('Club de Nuit 212 VIP 100 ml')], ['club', 'nuit', '212', 'vip'], 'número do nome fica, volume sai');
});

test('plano: só fatos, oculto, marca unificada, slug único, sem repetir cadastro da loja', () => {
  const catalogo = { schemaVersion: 2, products: [
    item(),
    item({ sourceId: 'atlantico:1', source: 'atlantico', name: '.. AFNAN 9 AM DIVE EDP 100ML', brand: 'AFNAN', description: null, images: [{ localPath: 'images/bbb.jpg', sha256: 'bbb' }] }),
    item({ sourceId: 'onuh:2', name: 'Khamrah EDP 100 ml', brand: 'Lattafa', images: [] }),
    item({ sourceId: 'onuh:3', name: 'Rasasi Hawas', brand: 'Rasasi', images: [{ localPath: 'images/aaa.jpg', sha256: 'aaa' }] }),
  ] };
  const estado = { ...vazio, slugs: ['afnan-9-am-dive-edp-100-ml'], marcas: [{ name: 'Afnan', slug: 'afnan' }], produtosLoja: [{ name: 'KHAMRAH', brand: 'Lattafa' }] };
  const plano = planejar(catalogo, estado, [{ nome: 'RASASI HAWAS EDP M 100ML' }]);
  assert.equal(plano.resumo.novos, 3);
  assert.equal(plano.resumo.repetidosDaLoja, 1, 'Khamrah já é cadastro da loja');
  assert.equal(plano.resumo.noRelatorio, 1);
  const [a, b, c] = plano.produtos;
  assert.equal(a.slug, 'afnan-9-am-dive-edp-100-ml-2', 'slug existente não é reaproveitado');
  assert.equal(b.slug, 'afnan-9-am-dive-edp-100ml');
  assert.equal(a.brandSlug, 'afnan'); assert.equal(b.brandSlug, 'afnan', 'AFNAN e Afnan são a mesma marca');
  assert.deepEqual(plano.marcasNovas.map((m) => m.name), ['Rasasi']);
  assert.equal(a.notesTop, 'Limão, Menta'); assert.equal(a.family, 'Cítrico');
  assert.equal(c.inStoreReport, 1); assert.equal(c.storeReportName, 'RASASI HAWAS EDP M 100ML');
  assert.equal(plano.fotos.length, 2, 'foto repetida (mesmo sha256) é enviada uma vez só');
  const sql = sqlCadastros(plano);
  assert.ok(!sql.includes('Texto de venda'), 'o texto de venda do fornecedor nunca vai para o banco');
  assert.throws(() => planejar({ schemaVersion: 1, products: [] }, vazio), /schemaVersion 2/);
});

test('importação ponta a ponta: tudo oculto, foto pública só com o produto publicado, lote publica', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  app.deps.storage = d1Storage(app.db);
  await app.createUser();
  await app.createUser({ username: 'ana', role: 'vendedora', name: 'Ana' });
  const catalogo = { schemaVersion: 2, products: Array.from({ length: 60 }, (_, i) => item({
    sourceId: `onuh:p${i}`, name: `Perfume Teste ${i} 100 ml`, brand: i % 2 ? 'Marca Nova' : 'Afnan',
    images: [{ localPath: `images/f${i}.jpg`, sha256: `f${i}` }],
  })) };
  const plano = planejar(catalogo, vazio, [{ nome: 'PERFUME TESTE 7 EDP 100ML' }]);
  app.db.raw.exec(sqlCadastros(plano));
  app.db.raw.exec(sqlCadastros(plano)); // rodar de novo não duplica
  const png = Buffer.from(PNG_DATA_URL.split(',')[1], 'base64');
  for (const f of plano.fotos) await app.deps.storage.put(f.key, png, 'image/webp');
  app.db.raw.exec(sqlLigarFotos(plano, plano.fotos.map((f) => f.key)));
  app.db.raw.exec(sqlLigarFotos(plano, plano.fotos.map((f) => f.key))); // idempotente

  const { c } = await app.db.prepare('SELECT COUNT(*) AS c FROM products WHERE source IS NOT NULL').first();
  assert.equal(c, 60);
  assert.equal((await app.db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE licensed = 1').first()).c, 60, 'fotos entram liberadas');
  assert.equal((await app.db.prepare('SELECT COUNT(*) AS c FROM products WHERE source_url IS NOT NULL').first()).c, 0, 'link do fornecedor não é guardado');
  assert.equal((await (await app.call('/api/products')).json()).products.length, 0, 'tudo entra oculto');
  const nova = await app.db.prepare("SELECT requires_product FROM brands WHERE name = 'Marca Nova'").first();
  assert.equal(nova.requires_product, 1, 'marca nova só aparece com produto publicado');

  const foto = '/uploads/' + plano.fotos[7].key;
  assert.equal((await app.call(foto)).status, 404, 'foto de produto oculto não é pública');
  await app.login();
  const noAdmin = await app.call(foto);
  assert.equal(noAdmin.status, 200, 'no admin a foto aparece');
  assert.equal(noAdmin.headers.get('cache-control'), 'private, no-store');

  // Lista paginada no admin, sem nome de fornecedor.
  const pag1 = await (await app.call('/admin/produtos?filtro=biblioteca')).text();
  assert.match(pag1, /Página 1 de 2/);
  assert.match(pag1, /No relatório da loja \(1\)/);
  assert.doesNotMatch(pag1, /ONUH|Atlântico|onuh\.com/i);
  const pag2 = await (await app.call('/admin/produtos?filtro=biblioteca&pagina=2')).text();
  assert.equal((pag2.match(/class="a-sel"/g) || []).length, 10);
  const imp = await (await app.call('/admin/produtos?origem=importado')).text();
  assert.match(imp, /60 produtos neste filtro/);

  // Publicar os do relatório (critério): a foto passa a ser pública.
  const r0 = await app.call('/api/admin/products/bulk', { method: 'POST', body: { action: 'publicar', criteria: { filter: 'no_relatorio' } } });
  assert.deepEqual(await r0.json(), { ok: true, affected: 1 });
  const pub = (await (await app.call('/api/products')).json()).products;
  assert.equal(pub.length, 1);
  assert.equal(pub[0].image, foto);
  const id = (await app.db.prepare("SELECT id FROM products WHERE source_id = 'onuh:p7'").first()).id;
  app.logout();
  const publica = await app.call(foto);
  assert.equal(publica.status, 200, 'publicada: pública');
  assert.equal(publica.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  let r;

  // Revisão de fotos em grade: só administração; "Tirar foto" usa a rota de excluir imagem.
  await app.login();
  const grade = await (await app.call('/admin/fotos?origem=importado')).text();
  assert.match(grade, /A foto principal de cada produto \(60\)/);
  assert.equal((grade.match(/class="a-foto"/g) || []).length, 60);
  const img = await app.db.prepare('SELECT pi.id FROM product_images pi WHERE pi.product_id = ?').bind(id).first();
  assert.equal((await app.call(`/api/admin/products/${id}/images/${img.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await app.call('/api/products')).json()).products[0].hasImage, false, 'sem a foto, volta a imagem padrão');
  app.logout();
  await app.login('ana');
  assert.equal((await app.call('/admin/fotos')).status, 302, 'vendedora não vê a revisão de fotos');
  app.logout();

  // Vendedora não faz ações em lote; ação inválida e lista vazia são recusadas.
  await app.login('ana');
  assert.equal((await app.call('/api/admin/products/bulk', { method: 'POST', body: { action: 'publicar', ids: [id] } })).status, 403);
  app.logout();
  await app.login();
  assert.equal((await app.call('/api/admin/products/bulk', { method: 'POST', body: { action: 'apagar', ids: [id] } })).status, 400);
  assert.equal((await app.call('/api/admin/products/bulk', { method: 'POST', body: { action: 'publicar', ids: [] } })).status, 400);
  // Publicar por marca + busca.
  r = await app.call('/api/admin/products/bulk', { method: 'POST', body: { action: 'publicar', criteria: { q: 'Teste 1', source: 'onuh' } } });
  assert.equal((await r.json()).affected, 11, '"Teste 1", "Teste 10".."Teste 19"');
});
