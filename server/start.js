// Ponto de entrada em produção (`npm start`). Faz duas coisas antes de subir
// o servidor:
//
// 1. Primeira vez num disco vazio (banco sem nenhum produto): monta a base
//    inteira rodando, na ordem, os mesmos scripts do README-V2.md ("Do zero
//    de verdade") — marcas, os 34 produtos, fotos, vínculos OliSek, logos e
//    a conta administradora. A senha temporária do admin aparece UMA vez
//    no log do deploy; o primeiro login obriga a trocar.
//    Nas vezes seguintes (o banco já tem produtos) isso é pulado — nenhum
//    script roda de novo por cima do que a equipe editou no /admin.
//
// 2. Sempre: garante que as fotos do catálogo que estão no repositório
//    (uploads/products/*/principal.*) existem no disco de uploads. Só copia
//    o que falta — nunca sobrescreve uma foto que já está lá.
//
// Localmente continua valendo `node server/app.js` direto; este arquivo só
// importa quando o banco/uploads moram num volume (STORAGE_DIR).
'use strict';

// node:sqlite (o banco) só existe a partir do Node 22.13 — se a hospedagem
// subir uma versão mais velha, falha aqui com uma mensagem clara em vez de
// um erro obscuro lá no meio do servidor. A versão usada no deploy vem do
// campo "engines" do package.json.
try { require('node:sqlite'); } catch {
  console.error(`[start] Este site precisa do Node 22.13 ou mais novo (encontrado: ${process.version}). Confira o campo "engines" do package.json.`);
  process.exit(1);
}

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, STORAGE_DIR, DB_PATH, UPLOADS_DIR } = require('./paths');

const SCRIPTS_PRIMEIRA_VEZ = [
  'seed.js',
  'migrate-images.js',
  'olisek-import-2026-09-23.js',
  'olisek-link-status-2026-09-24.js',
  'import-marcas-logos-2026-09-23.js',
  'import-marcas-novas-2026-09-23.js',
];

function totalDeProdutos() {
  if (!fs.existsSync(DB_PATH)) return 0;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB_PATH);
  try {
    const tem = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'").get();
    return tem ? db.prepare('SELECT COUNT(*) AS c FROM products').get().c : 0;
  } finally {
    db.close();
  }
}

function montarBaseDoZero() {
  console.log(`[start] Banco vazio em ${DB_PATH} — montando a base inicial.`);
  for (const script of SCRIPTS_PRIMEIRA_VEZ) {
    console.log(`[start] -> node server/${script}`);
    execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env: process.env });
  }
  console.log('[start] Base inicial pronta. Anote a senha temporária do admin impressa acima.');
}

function copiarFotosDoRepositorio() {
  const origem = path.join(ROOT, 'uploads', 'products');
  const destino = path.join(UPLOADS_DIR, 'products');
  if (path.resolve(origem) === path.resolve(destino) || !fs.existsSync(origem)) return;
  let copiadas = 0;
  for (const slug of fs.readdirSync(origem)) {
    const dirOrigem = path.join(origem, slug);
    if (!fs.statSync(dirOrigem).isDirectory()) continue;
    for (const arquivo of fs.readdirSync(dirOrigem)) {
      if (!arquivo.startsWith('principal.')) continue;
      const alvo = path.join(destino, slug, arquivo);
      if (fs.existsSync(alvo)) continue;
      fs.mkdirSync(path.dirname(alvo), { recursive: true });
      fs.copyFileSync(path.join(dirOrigem, arquivo), alvo);
      copiadas += 1;
    }
  }
  if (copiadas) console.log(`[start] ${copiadas} foto(s) do catálogo copiadas para ${destino}.`);
}

if (STORAGE_DIR) console.log(`[start] Guardando banco e fotos em ${STORAGE_DIR} (STORAGE_DIR).`);
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (totalDeProdutos() === 0) montarBaseDoZero();
copiarFotosDoRepositorio();

require('./app');
