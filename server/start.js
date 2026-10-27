// Ponto de entrada do servidor Node em produção (`npm start`) — usado pelo
// Railway até a troca para a Cloudflare terminar (ver docs/CLOUDFLARE.md).
// Na Cloudflare, quem roda é src/worker.js; este arquivo não é usado lá.
//
// 1. Banco vazio (primeira vez num volume novo): monta a base inteira com os
//    mesmos scripts de sempre (marcas, 34 produtos, fotos, vínculos OliSek,
//    logos e a conta `admin`). A senha temporária aparece UMA vez no log.
// 2. Sempre: cria o admin opcional das variáveis CREATE_ADMIN_* e unifica
//    variações de categoria.
import fs from 'node:fs';

// node:sqlite só existe a partir do Node 22.13.
try { await import('node:sqlite'); } catch {
  console.error(`[start] Este site precisa do Node 22.13 ou mais novo (encontrado: ${process.version}).`);
  process.exit(1);
}

const { storagePaths } = await import('./paths.js');
const { openDatabase } = await import('./sqlite-d1.js');
const { normalizarCategoriasGravadas } = await import('../src/services/catalog.js');
const { createNodeDeps, listen } = await import('./app.js');

const { STORAGE_DIR, DB_PATH, UPLOADS_DIR } = storagePaths();
if (STORAGE_DIR) console.log(`[start] Guardando banco e fotos em ${STORAGE_DIR} (STORAGE_DIR).`);
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = openDatabase(DB_PATH);

const { run: montarBaseInicial } = await import('../scripts/base-inicial.js');
if (await montarBaseInicial(db, UPLOADS_DIR)) {
  console.log('[start] Base inicial pronta. Anote a senha temporária do admin impressa acima.');
}

await (await import('../scripts/create-admin-from-env.js')).run(db);
const n = await normalizarCategoriasGravadas(db);
if (n) console.log(`[catalogo] ${n} produto(s) com categoria unificada.`);

listen(createNodeDeps(process.env, { db }));
