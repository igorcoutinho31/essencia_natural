// Seed único: migra o catálogo antigo (seed/catalog.json, 34 itens estáticos)
// para o banco da V2, cria as 17 marcas que a loja informou trabalhar,
// vincula os 5 produtos com ID/estoque confirmados da OliSek, e cria a
// conta administradora inicial com senha temporária.
//
// Rodar com: node scripts/seed.js
// É seguro rodar mais de uma vez: pula o que já existe (verifica pelas
// tabelas vazias) e nunca sobrescreve preço ou dado editado manualmente.
import fs from 'node:fs';
import path from 'node:path';
import * as auth from '../src/auth.js';
import * as catalog from '../src/services/catalog.js';
import { uniqueSlug } from '../src/util.js';
import { SEED_DIR } from '../server/paths.js';
import { runAsScript } from './script-db.js';

// As 17 marcas que a loja confirmou trabalhar (mensagem do cliente,
// 23/09/2026), mais 6 marcas confirmadas depois (mensagem do cliente,
// 23/09/2026 à noite — aparecem nos relatórios de estoque da loja):
// Amouage, Anfar, Ferassa, Maison Asrar, Volaré e Ard Al Zaafaran. Logos:
// ver `scripts/import-marcas-logos-2026-09-23.js` e
// `scripts/import-marcas-novas-2026-09-23.js` — este seed só garante que a
// marca existe; quem liga o logo são os scripts de import.
const MARCAS_CONFIRMADAS = [
  'Lattafa', 'Maison Alhambra', 'Armaf', 'Afnan', 'Orientica', 'Al Wataniah',
  'Al Haramain', 'Asdaaf', 'Aurora', 'Bharara', 'Zimaya', 'French Avenue',
  'Rave', 'Rasasi', 'Paris Corner', 'Rayhaan', 'Dkhoon Emirates', 'QAWAFI',
  'Amouage', 'Anfar', 'Ferassa', 'Maison Asrar', 'Volaré', 'Ard Al Zaafaran',
];

// Vínculo com a OliSek confirmado pelo cliente em 23/09/2026 (mensagem com
// os 5 exemplos). Ligação feita por correspondência de nome com o catálogo
// já existente — 4 são uma correspondência direta e óbvia; "SABAH" está
// marcado como "provavel" porque o nome do site é mais curto que o nome
// completo da OliSek (ver docs/OLISEK-INTEGRATION.md antes de confiar 100%).
// `confidence` já usa os valores novos de `olisek_link_status`
// ('confirmed'/'probable'/'needs_review'/'unlinked' — ver
// docs/OLISEK-INTEGRATION.md); os outros 29 produtos do catalog.json ficam
// 'unlinked' até a importação completa (scripts/olisek-import-2026-09-23.js).
const OLISEK_SEED = [
  { match: (n) => n === 'ATHEERI', olisekId: 804491, olisekName: 'LATTAFA ATHEERI EDP F 100ML', brand: 'Lattafa', stock: 28, confidence: 'confirmed' },
  { match: (n) => n === 'KHAMARAH', olisekId: 804502, olisekName: 'LATTAFA KHAMARA EDP U 100ML', brand: 'Lattafa', stock: 4, confidence: 'confirmed' },
  { match: (n) => n === 'Marshmallow Blush', olisekId: 804547, olisekName: 'PARIS CORNER MARSHMALLOW BLUSH ED100ML', brand: 'Paris Corner', stock: 50, confidence: 'confirmed' },
  { match: (n) => n === 'club de nuit Intense Man', olisekId: 804007, olisekName: 'ARMAF CLUB DE NUIT INTENSE EDP M 105ML', brand: 'Armaf', stock: 122, confidence: 'confirmed' },
  { match: (n) => n === 'SABAH', olisekId: 803958, olisekName: 'AL WATANIAH SABAH AL WARD EDP 100ML', brand: 'Al Wataniah', stock: 558, confidence: 'probable' },
];

export async function run(db) {
  const jaTemProdutos = (await db.prepare('SELECT COUNT(*) AS c FROM products').first()).c > 0;

  console.log('== 1. Marcas ==');
  const brandIdByName = {};
  for (const nome of MARCAS_CONFIRMADAS) {
    const existia = await db.prepare('SELECT id FROM brands WHERE name = ?').bind(nome).first();
    brandIdByName[nome] = await catalog.ensureBrand(db, nome);
    console.log(`  ${existia ? 'já existia' : 'criada'}: ${nome}`);
  }
  // Marcas já citadas no catalog.json antigo mas fora da lista de 17 (garante
  // que não se perde o vínculo dos itens QAWAFI/Paris Corner do catálogo).
  for (const n of ['QAWAFI', 'Paris Corner']) brandIdByName[n] = await catalog.ensureBrand(db, n);

  if (jaTemProdutos) {
    console.log('\nProdutos já existem no banco — pulando a migração do catalog.json (rode só uma vez).');
  } else {
    console.log('\n== 2. Migrando seed/catalog.json (34 itens) ==');
    const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'catalog.json'), 'utf8'));
    const insert = db.prepare(`
      INSERT INTO products (slug, name, brand_id, category, description, notes_top, notes_heart, notes_base,
        price, compare_price, stock, active, featured, legacy_instagram_url,
        olisek_id, olisek_name, olisek_link_status, stock_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, 0, ?, ?, ?, ?, ?)
    `);
    const usedSlugs = new Set();
    let vinculados = 0;
    for (const p of raw.products) {
      const slug = await uniqueSlug(p.name, (x) => usedSlugs.has(x));
      usedSlugs.add(slug);
      const olisek = OLISEK_SEED.find((o) => o.match(p.name));
      if (olisek) vinculados += 1;
      const brandName = olisek ? olisek.brand : p.brand;
      await insert.bind(
        slug,
        p.name,
        brandName ? (brandIdByName[brandName] || await catalog.ensureBrand(db, brandName)) : null,
        p.category || null,
        p.description || null,
        p.notes?.topo || null,
        p.notes?.coracao || null,
        p.notes?.fundo || null,
        olisek ? olisek.stock : 0,
        p.instagram_post_url || null,
        olisek ? olisek.olisekId : null,
        olisek ? olisek.olisekName : null,
        olisek ? olisek.confidence : 'unlinked',
        // Sem vínculo, o estoque 0 é só o padrão da coluna, não uma
        // afirmação de ninguém — 'none', não 'manual' (ver isStockReliable
        // em src/services/catalog.js).
        olisek ? 'olisek_import' : 'none',
      ).run();
      // fotos do catálogo antigo: copiadas para uploads/products/<slug>/ pelo migrate-images.js
    }
    console.log(`  ${raw.products.length} produtos migrados (${vinculados} já vinculados à OliSek).`);
    console.log('  Os outros', raw.products.length - vinculados, 'ficam com estoque 0 e sem vínculo até a lista completa chegar (ver docs/OLISEK-INTEGRATION.md).');
  }

  console.log('\n== 3. Conta administradora inicial ==');
  const jaTemAdmin = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").first()).c > 0;
  if (jaTemAdmin) {
    console.log('  Já existe um admin — nada a fazer. (Esqueceu a senha? Rode scripts/reset-admin-password.js.)');
  } else {
    const senha = auth.generateTempPassword();
    const { hash, salt } = auth.hashPassword(senha);
    await db.prepare(`
      INSERT INTO users (name, username, password_hash, password_salt, role, must_change_password)
      VALUES ('Administração', 'admin', ?, ?, 'admin', 1)
    `).bind(hash, salt).run();
    console.log('  Usuário: admin');
    console.log('  Senha temporária (anote agora — não é mostrada de novo):', senha);
    console.log('  Ela será obrigada a trocar a senha no primeiro login em /admin.');
  }

  console.log('\nSeed concluído.');
}

await runAsScript(import.meta.url, run);
