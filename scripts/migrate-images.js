// Copia as fotos do catálogo inicial (seed/fotos/, vindas do Instagram)
// para a pasta de uploads, uma por produto, e registra cada uma na tabela
// product_images. Roda depois de scripts/seed.js.
//
//   node scripts/migrate-images.js
import fs from 'node:fs';
import path from 'node:path';
import * as catalog from '../src/services/catalog.js';
import { SEED_DIR, storagePaths } from '../server/paths.js';
import { runAsScript } from './script-db.js';

export async function run(db, uploadsDir = storagePaths().UPLOADS_DIR) {
  const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'catalog.json'), 'utf8'));
  const byName = new Map(raw.products.map((p) => [p.name, p.image]));

  const produtos = (await db.prepare('SELECT id, slug, name FROM products').all()).results;
  let copiados = 0, pulados = 0;

  for (const prod of produtos) {
    const jaTem = (await db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE product_id=?').bind(prod.id).first()).c > 0;
    if (jaTem) { pulados += 1; continue; }
    const rel = byName.get(prod.name);
    if (!rel) continue;
    // Em seed/catalog.json o campo `image` ainda guarda o caminho antigo
    // (seed/fotos/<arquivo>); o arquivo mora hoje em seed/fotos/.
    const origem = path.join(SEED_DIR, 'fotos', path.basename(rel));
    if (!fs.existsSync(origem)) { console.warn('  faltando no disco:', origem); continue; }

    const destDir = path.join(uploadsDir, 'products', prod.slug);
    fs.mkdirSync(destDir, { recursive: true });
    const destino = path.join(destDir, 'principal.webp');
    fs.copyFileSync(origem, destino);
    await catalog.addImage(db, prod.id, `/uploads/products/${prod.slug}/principal.webp`, { isMain: true });
    copiados += 1;
  }
  console.log(`Imagens copiadas: ${copiados}. Já tinham imagem (puladas): ${pulados}.`);
}

await runAsScript(import.meta.url, (db) => run(db));
