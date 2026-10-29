// Padronização das fotos (tools/fotos-plano.js): antigas da loja dão lugar à
// foto do pacote; importadas ganham a versão em alta numa chave nova.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers.js';
import { planejarFotos, sqlTrocas } from '../tools/fotos-plano.js';

const catalogo = { schemaVersion: 2, products: [
  { sourceId: 'onuh:1', name: 'Lattafa Khamrah EDP 100 ml', brand: 'Lattafa', images: [{ localPath: 'images/k.jpg', sha256: 'kkk' }] },
  { sourceId: 'onuh:2', name: 'Afnan 9 Am Dive EDP 100 ml', brand: 'Afnan', images: [{ localPath: 'images/a.jpg', sha256: 'aaa' }] },
  { sourceId: 'onuh:3', name: 'Sem Foto', brand: 'X', images: [] },
] };

test('fotos: plano troca as antigas da loja e põe as importadas em alta', () => {
  const produtos = [
    { id: 1, name: 'KHAMRAH', brand: 'Lattafa', source: null, active: true, imagens: ['/uploads/products/khamrah/old.webp'] },
    { id: 2, name: '9 Am Dive', brand: 'Afnan', source: 'onuh', sourceId: 'onuh:2', active: true, imagens: ['/uploads/biblioteca/aaa.webp'] },
    { id: 3, name: 'Perfume Só da Loja', brand: 'Lattafa', source: null, active: true, imagens: ['/uploads/products/x/y.webp'] },
    { id: 4, name: 'Oculto', brand: 'Afnan', source: 'onuh', sourceId: 'onuh:2', active: false, imagens: [] },
  ];
  const plano = planejarFotos(catalogo, produtos);
  assert.deepEqual(plano.resumo, { daLoja: 1, importados: 1, semPar: 1, fotosNovas: 2 });
  assert.deepEqual(plano.semPar.map((p) => p.id), [3]);
  assert.deepEqual(plano.fotos.map((f) => f.key).sort(), ['biblioteca/aaa-hd.webp', 'biblioteca/kkk-hd.webp']);
  assert.equal(planejarFotos(catalogo, produtos, { todos: true }).trocas.length, 3, '--todos inclui ocultos');
  const feito = produtos.map((p) => (p.id === 2 ? { ...p, imagens: ['/uploads/biblioteca/aaa-hd.webp'] } : p));
  assert.equal(planejarFotos(catalogo, feito).resumo.importados, 0, 'rodar de novo pula o que já foi feito');
});

test('fotos: SQL troca a foto e manda a antiga para a lixeira', async (t) => {
  const app = createTestApp();
  t.after(app.cleanup);
  const id = await app.insertProduct({ slug: 'khamrah', name: 'KHAMRAH' });
  app.db.raw.exec(`INSERT INTO product_images (product_id, file_path, sort_order, is_main) VALUES (${id}, '/uploads/products/khamrah/old.webp', 0, 1);`);
  const plano = { trocas: [{ productId: id, novaFoto: '/uploads/biblioteca/kkk-hd.webp', antigas: ['/uploads/products/khamrah/old.webp'] }] };
  assert.equal(sqlTrocas(plano, []).trim(), '', 'sem foto enviada, nada muda');
  app.db.raw.exec(sqlTrocas(plano, ['biblioteca/kkk-hd.webp']));
  const imgs = app.db.raw.prepare('SELECT file_path, is_main, licensed FROM product_images WHERE product_id = ?').all(id);
  assert.deepEqual(imgs.map((r) => ({ ...r })), [{ file_path: '/uploads/biblioteca/kkk-hd.webp', is_main: 1, licensed: 1 }]);
  assert.equal(app.db.raw.prepare("SELECT COUNT(*) AS n FROM upload_trash WHERE key = 'products/khamrah/old.webp'").get().n, 1);
});
