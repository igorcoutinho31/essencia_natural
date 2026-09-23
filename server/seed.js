// Seed único: migra o catálogo antigo (data/catalog.json, 34 itens estáticos)
// para o banco da V2, cria as 17 marcas que a loja informou trabalhar,
// vincula os 5 produtos com ID/estoque confirmados da OliSek, e cria a
// conta administradora inicial com senha temporária.
//
// Rodar com: node server/seed.js
// É seguro rodar mais de uma vez: pula o que já existe (verifica pelas
// tabelas vazias) e nunca sobrescreve preço ou dado editado manualmente.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const auth = require('./auth');
const catalogService = require('./services/catalogService');
const { uniqueSlug } = require('./util');

const ROOT = path.join(__dirname, '..');

// As 17 marcas que a loja confirmou trabalhar (mensagem do cliente,
// 23/09/2026). Nenhum logo foi enviado ainda — ficam sem imagem até a loja
// mandar os arquivos (ver docs/CATALOGO.md).
const MARCAS_CONFIRMADAS = [
  'Lattafa', 'Maison Alhambra', 'Armaf', 'Afnan', 'Orientica', 'Al Wataniah',
  'Al Haramain', 'Asdaaf', 'Aurora', 'Bharara', 'Zimaya', 'French Avenue',
  'Rave', 'Rasasi', 'Paris Corner', 'Rayhaan', 'Dkhoon Emirates', 'QAWAFI',
];

// Vínculo com a OliSek confirmado pelo cliente em 23/09/2026 (mensagem com
// os 5 exemplos). Ligação feita por correspondência de nome com o catálogo
// já existente — 4 são uma correspondência direta e óbvia; "SABAH" está
// marcado como "provavel" porque o nome do site é mais curto que o nome
// completo da OliSek (ver docs/OLISEK-INTEGRATION.md antes de confiar 100%).
// `confidence` já usa os valores novos de `olisek_link_status`
// ('confirmed'/'probable'/'needs_review'/'unlinked' — ver
// docs/OLISEK-INTEGRATION.md); os outros 29 produtos do catalog.json ficam
// 'unlinked' até a importação completa (server/olisek-import-2026-09-23.js).
const OLISEK_SEED = [
  { match: (n) => n === 'ATHEERI', olisekId: 804491, olisekName: 'LATTAFA ATHEERI EDP F 100ML', brand: 'Lattafa', stock: 28, confidence: 'confirmed' },
  { match: (n) => n === 'KHAMARAH', olisekId: 804502, olisekName: 'LATTAFA KHAMARA EDP U 100ML', brand: 'Lattafa', stock: 4, confidence: 'confirmed' },
  { match: (n) => n === 'Marshmallow Blush', olisekId: 804547, olisekName: 'PARIS CORNER MARSHMALLOW BLUSH ED100ML', brand: 'Paris Corner', stock: 50, confidence: 'confirmed' },
  { match: (n) => n === 'club de nuit Intense Man', olisekId: 804007, olisekName: 'ARMAF CLUB DE NUIT INTENSE EDP M 105ML', brand: 'Armaf', stock: 122, confidence: 'confirmed' },
  { match: (n) => n === 'SABAH', olisekId: 803958, olisekName: 'AL WATANIAH SABAH AL WARD EDP 100ML', brand: 'Al Wataniah', stock: 558, confidence: 'probable' },
];

function run() {
  const jaTemProdutos = db.prepare('SELECT COUNT(*) AS c FROM products').get().c > 0;

  console.log('== 1. Marcas ==');
  const brandIdByName = {};
  for (const nome of MARCAS_CONFIRMADAS) {
    const id = catalogService.ensureBrand(nome);
    brandIdByName[nome] = id;
    console.log(`  ${db.prepare('SELECT 1 FROM brands WHERE id=? AND created_at > datetime(\'now\',\'-2 seconds\')').get(id) ? 'criada' : 'já existia'}: ${nome}`);
  }
  // Marcas já citadas no catalog.json antigo mas fora da lista de 17 (garante
  // que não se perde o vínculo dos itens QAWAFI/Paris Corner do catálogo).
  ['QAWAFI', 'Paris Corner'].forEach((n) => { brandIdByName[n] = catalogService.ensureBrand(n); });

  if (jaTemProdutos) {
    console.log('\nProdutos já existem no banco — pulando a migração do catalog.json (rode só uma vez).');
  } else {
    console.log('\n== 2. Migrando data/catalog.json (34 itens) ==');
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
    const insert = db.prepare(`
      INSERT INTO products (slug, name, brand_id, category, description, notes_top, notes_heart, notes_base,
        price, compare_price, stock, active, featured, legacy_instagram_url,
        olisek_id, olisek_name, olisek_link_status, stock_source)
      VALUES (@slug, @name, @brandId, @category, @description, @notesTop, @notesHeart, @notesBase,
        NULL, NULL, @stock, 1, 0, @legacyUrl,
        @olisekId, @olisekName, @olisekLinkStatus, @stockSource)
    `);
    const usedSlugs = new Set();
    let vinculados = 0;
    for (const p of raw.products) {
      const slug = uniqueSlug(p.name, (s) => usedSlugs.has(s));
      usedSlugs.add(slug);
      const olisek = OLISEK_SEED.find((o) => o.match(p.name));
      if (olisek) vinculados += 1;
      const brandName = olisek ? olisek.brand : p.brand;
      insert.run({
        slug,
        name: p.name,
        brandId: brandName ? (brandIdByName[brandName] || catalogService.ensureBrand(brandName)) : null,
        category: p.category || null,
        description: p.description || null,
        notesTop: p.notes?.topo || null,
        notesHeart: p.notes?.coracao || null,
        notesBase: p.notes?.fundo || null,
        stock: olisek ? olisek.stock : 0,
        legacyUrl: p.instagram_post_url || null,
        olisekId: olisek ? olisek.olisekId : null,
        olisekName: olisek ? olisek.olisekName : null,
        olisekLinkStatus: olisek ? olisek.confidence : 'unlinked',
        // Sem vínculo, o estoque 0 é só o padrão da coluna, não uma
        // afirmação de ninguém — 'none', não 'manual' (ver isStockReliable
        // em catalogService.js e a migração em server/db.js).
        stockSource: olisek ? 'olisek_import' : 'none',
      });
      // fotos do catálogo antigo: copiadas para uploads/products/<slug>/ pelo migrate-images.js
    }
    console.log(`  ${raw.products.length} produtos migrados (${vinculados} já vinculados à OliSek).`);
    console.log('  Os outros', raw.products.length - vinculados, 'ficam com estoque 0 e sem vínculo até a lista completa chegar (ver docs/OLISEK-INTEGRATION.md).');
  }

  console.log('\n== 3. Conta administradora inicial ==');
  const jaTemAdmin = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").get().c > 0;
  if (jaTemAdmin) {
    console.log('  Já existe um admin — nada a fazer. (Esqueceu a senha? Rode server/reset-admin-password.js.)');
  } else {
    const senha = auth.generateTempPassword();
    const { hash, salt } = auth.hashPassword(senha);
    db.prepare(`
      INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password)
      VALUES ('Administração', 'admin', ?, ?, 'admin', 1)
    `).run(hash, salt);
    console.log('  Usuário: admin');
    console.log('  Senha temporária (anote agora — não é mostrada de novo):', senha);
    console.log('  Ela será obrigada a trocar a senha no primeiro login em /admin.');
  }

  console.log('\nSeed concluído.');
}

run();
