// Copia as fotos que já existiam em assets/catalog/ (o catálogo antigo,
// direto do Instagram) para a pasta de uploads da V2, uma por produto, e
// registra cada uma na tabela product_images. Roda depois de server/seed.js.
//
//   node server/migrate-images.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const catalogService = require('./services/catalogService');

const ROOT = path.join(__dirname, '..');

function run() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
  const byName = new Map(raw.products.map((p) => [p.name, p.image]));

  const produtos = db.prepare('SELECT id, slug, name FROM products').all();
  let copiados = 0, pulados = 0;

  for (const prod of produtos) {
    const jaTem = db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE product_id=?').get(prod.id).c > 0;
    if (jaTem) { pulados += 1; continue; }
    const rel = byName.get(prod.name);
    if (!rel) continue;
    const origem = path.join(ROOT, rel);
    if (!fs.existsSync(origem)) { console.warn('  faltando no disco:', origem); continue; }

    const destDir = path.join(ROOT, 'uploads', 'products', prod.slug);
    fs.mkdirSync(destDir, { recursive: true });
    const destino = path.join(destDir, 'principal.webp');
    fs.copyFileSync(origem, destino);
    catalogService.addImage(prod.id, `/uploads/products/${prod.slug}/principal.webp`, { isMain: true });
    copiados += 1;
  }
  console.log(`Imagens copiadas: ${copiados}. Já tinham imagem (puladas): ${pulados}.`);
}

run();
