// Monta a base inicial do site num banco vazio, na ordem certa: marcas e os
// 34 produtos (seed.js), fotos (migrate-images.js), vínculos OliSek, logos
// e marcas novas, mais a conta `admin` com senha temporária (impressa uma
// vez no terminal). Usado no Node local e por
// `npm run cf:importar -- --do-zero` (Cloudflare).
//
//   node scripts/base-inicial.js        (banco local em .local/)
import { openingBalances } from '../server/sqlite-d1.js';
import { storagePaths } from '../server/paths.js';
import { runAsScript } from './script-db.js';

const PASSOS = [
  'seed.js',
  'migrate-images.js',
  'olisek-import-2026-09-23.js',
  'olisek-link-status-2026-09-24.js',
  'import-marcas-logos-2026-09-23.js',
  'import-marcas-novas-2026-09-23.js',
];

export async function run(db, uploadsDir = storagePaths().UPLOADS_DIR) {
  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM products').first();
  if (c > 0) { console.log('O banco já tem produtos — base inicial não foi montada de novo.'); return false; }
  for (const script of PASSOS) {
    console.log(`\n-> scripts/${script}`);
    const mod = await import(`./${script}`);
    await (script === 'migrate-images.js' ? mod.run(db, uploadsDir) : mod.run(db));
  }
  openingBalances(db); // abre o histórico de estoque com o saldo importado
  return true;
}

await runAsScript(import.meta.url, (db) => run(db));
