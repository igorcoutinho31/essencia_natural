// Chama o wrangler (CLI da Cloudflare) instalado em node_modules — usado
// pelos scripts de tools/ (precisa de `npm install` antes). Funciona no
// Windows, macOS e Linux.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const D1_NAME = 'essencia-natural';
export const R2_BUCKET = 'essencia-natural-uploads';

// Chama o wrangler.js pelo próprio Node, sem passar por um shell — assim
// SQL com espaços/aspas chega intacto também no Windows.
const WRANGLER_BIN = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export function wrangler(args, { capture = false } = {}) {
  if (!fs.existsSync(WRANGLER_BIN)) throw new Error('wrangler não encontrado — rode `npm install` primeiro.');
  const r = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
    cwd: ROOT,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} falhou (código ${r.status}).`);
  return r.stdout;
}

/** `--local` (banco/arquivos do `wrangler dev`) ou `--remote` (produção). */
export function targetFlag(argv) {
  if (argv.includes('--local')) return '--local';
  if (argv.includes('--remote')) return '--remote';
  throw new Error('Diga onde aplicar: --remote (Cloudflare, produção) ou --local (wrangler dev).');
}

export function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
