// Ajuda dos scripts de linha de comando (seed, imports, reset de senha):
// abre o banco local (.local/essencia.sqlite ou $STORAGE_DIR) e diz se o
// arquivo foi chamado direto pelo `node`.
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/sqlite-d1.js';
import { storagePaths } from '../server/paths.js';

export function openLocalDb() {
  return openDatabase(storagePaths().DB_PATH);
}

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(metaUrl) === process.argv[1];
}

/** Roda `run(db)` quando o script é chamado direto, e fecha o banco. */
export async function runAsScript(metaUrl, run) {
  if (!isMain(metaUrl)) return;
  const db = openLocalDb();
  try { await run(db); } finally { db.close(); }
}
