// Caminhos do projeto e de onde o servidor Node local guarda o que muda
// enquanto está no ar: o banco SQLite e as fotos enviadas pelo /admin.
// (Na Cloudflare isso fica no D1 e no R2 — este arquivo só vale para o Node.)
//
// Sem configurar nada: .local/essencia.sqlite e .local/uploads/ (fora do git).
// Com STORAGE_DIR (ex.: um disco separado em /data):
//   $STORAGE_DIR/essencia.sqlite  e  $STORAGE_DIR/uploads/
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const SEED_DIR = path.join(ROOT, 'seed');
export const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

export function storagePaths(env = process.env) {
  const dir = env.STORAGE_DIR ? path.resolve(env.STORAGE_DIR) : path.join(ROOT, '.local');
  return {
    STORAGE_DIR: env.STORAGE_DIR ? dir : null,
    DB_PATH: path.join(dir, 'essencia.sqlite'),
    UPLOADS_DIR: path.join(dir, 'uploads'),
  };
}
